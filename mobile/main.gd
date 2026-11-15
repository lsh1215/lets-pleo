extends Node3D

const VillageModels = preload("res://models.gd")
const ResidentModels = preload("res://residents.gd")

const INITIAL_GRID: int = 12
const SERVER_DESKTOP: String = "http://127.0.0.1:4187"
const SERVER_ANDROID: String = "http://10.0.2.2:4187"
const SAVE_PATH: String = "user://session.json"
const DRAFT_PATH: String = "user://placement_draft.json"
const COLORS: Dictionary = {
	"ground": Color("9fbd83"), "road": Color("ead6ac"), "wood": Color("b98158"),
	"stone": Color("a2a8a1"), "fabric": Color("f2ba87"), "seed": Color("7caa74"),
	"bench": Color("bc865d"), "flowerbed": Color("79ad74"), "lamp": Color("f6d88d")
}

var token: String = ""
var requests_in_flight: int = 0
var mutation_generation: int = 0
var app_in_foreground: bool = true
var village_state: Dictionary = {}
var pending_draft: Dictionary = {}
var grid_size: int = INITIAL_GRID
var selected_recipe: String = "bench"
var recipe_ids: Array[String] = []
var crafted_item: String = ""
var placement_rotation: int = 0
var selected_item: String = ""
var editing_item: String = ""
var placement_cell: Vector2i = Vector2i(4, 4)
var yaw: float = 0.75
var pitch: float = -0.6
var zoom: float = 12.5
var orbit: Node3D
var camera: Camera3D
var objects: Node3D
var resident_root: Node3D
var resident_agents: Dictionary = {}
var dialogue_cursor: Dictionary = {}
var ground: MeshInstance3D
var status: Label
var inventory_label: Label
var village_label: Label
var action_button: Button
var recipe_catalog: Array[Dictionary] = []
var recipe_previews: Dictionary = {}
var resource_row: HBoxContainer
var sheet: PanelContainer
var sheet_body: VBoxContainer
var active_tab: String = "village"
var tab_buttons: Dictionary = {}
var pair_code_value: String = ""
var tutorial_card: PanelContainer
var tutorial_title: Label
var tutorial_hint: Label
var tutorial_button: Button
var tutorial_action: String = ""
var intro_completed: bool = false
var journey_reward: Dictionary = {}
var garden_button: Button
var quest_button: Button
var drag_origin: Vector2
var mouse_origin: Vector2
var touches: Dictionary = {}
var touch_started_at: Dictionary = {}
var material_cache: Dictionary = {}
var decorative_meshes: Dictionary = {}
var decorative_batches: Dictionary = {}

func _ready() -> void:
	_build_world()
	_build_interface()
	_load_session()
	_load_draft()
	_render_state()
	_sync()
	var sync_timer := Timer.new()
	sync_timer.wait_time = 2.0
	sync_timer.timeout.connect(_poll_state)
	add_child(sync_timer)
	sync_timer.start()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		app_in_foreground = false
	elif what == NOTIFICATION_APPLICATION_FOCUS_IN:
		app_in_foreground = true

func _poll_state() -> void:
	if not app_in_foreground or token == "" or requests_in_flight > 0 or not pending_draft.is_empty():
		return
	var generation := mutation_generation
	var response := await _api(HTTPClient.METHOD_GET, "/v1/state")
	# Discard a response started before a craft/place/claim request.
	if response.has("error") or generation != mutation_generation or not pending_draft.is_empty():
		return
	var previous_grants: Array = village_state.get("grants", [])
	if response != village_state:
		village_state = response
		_save_session()
		_render_state()
	if recipe_ids.is_empty():
		await _load_catalog()
	if status.text.begins_with("연결을 기다려요") or status.text.begins_with("연결할 수 없어요"):
		status.text = "오늘의 마을"
	if response.get("grants", []).size() > previous_grants.size():
		status.text = "새 여행이 도착했어요 · 여행 탭에서 선물 받기"

func _server() -> String:
	return SERVER_ANDROID if OS.get_name() == "Android" else SERVER_DESKTOP

func _api(method: HTTPClient.Method, path: String, body: Dictionary = {}, authenticated: bool = true) -> Dictionary:
	requests_in_flight += 1
	if method != HTTPClient.METHOD_GET:
		mutation_generation += 1
	var req := HTTPRequest.new()
	req.timeout = 10.0
	add_child(req)
	var headers := PackedStringArray(["Content-Type: application/json"])
	if authenticated and token != "":
		headers.append("Authorization: Bearer " + token)
	var error := req.request(_server() + path, headers, method, JSON.stringify(body) if method != HTTPClient.METHOD_GET else "")
	if error != OK:
		requests_in_flight -= 1
		req.queue_free()
		return {"error": "NETWORK_UNAVAILABLE"}
	var result: Array = await req.request_completed
	requests_in_flight -= 1
	req.queue_free()
	if int(result[1]) == 0:
		return {"error": "NETWORK_UNAVAILABLE"}
	var parsed: Variant = JSON.parse_string(result[3].get_string_from_utf8())
	if result[1] < 200 or result[1] >= 300:
		return parsed if parsed is Dictionary else {"error": "HTTP_%d" % result[1]}
	return parsed if parsed is Dictionary else {"error": "INVALID_RESPONSE"}

func _load_session() -> void:
	if FileAccess.file_exists(SAVE_PATH):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
		if parsed is Dictionary:
			token = str(parsed.get("token", ""))
			village_state = parsed.get("state", {})
			journey_reward = parsed.get("journey_reward", {})
			for entry in parsed.get("catalog", []):
				if entry is Dictionary:
					recipe_catalog.append(entry)

func _save_session() -> void:
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify({"token": token, "state": village_state, "catalog": recipe_catalog, "journey_reward": journey_reward}))

func _load_draft() -> void:
	if FileAccess.file_exists(DRAFT_PATH):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(DRAFT_PATH))
		if parsed is Dictionary and parsed.has("itemId"):
			pending_draft = parsed

func _write_draft() -> void:
	var file := FileAccess.open(DRAFT_PATH, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(pending_draft))

func _save_draft() -> void:
	_write_draft()
	_render_state()

func _clear_draft() -> void:
	pending_draft = {}
	_write_draft()

func _sync() -> void:
	if token == "":
		status.text = "마을을 만드는 중..."
		var guest := await _api(HTTPClient.METHOD_POST, "/v1/guest", {}, false)
		if guest.has("error"):
			status.text = "연결할 수 없어요 · ↻를 눌러 다시 시도"
			return
		token = str(guest.get("token", ""))
		_save_session()
	var response := await _api(HTTPClient.METHOD_GET, "/v1/state")
	if response.has("error"):
		status.text = "연결을 기다려요 · ↻로 다시 시도"
		return
	village_state = response
	_save_session()
	_render_state()
	if recipe_ids.is_empty():
		await _load_catalog()
	if not pending_draft.is_empty():
		await _sync_draft()
		return
	status.text = "오늘의 마을"

func _sync_draft() -> void:
	var item := _item_by_id(str(pending_draft.get("itemId", "")))
	if item.is_empty():
		status.text = "배치안의 가구를 찾을 수 없어요"
		return
	if item.get("x") != null and int(item["x"]) == int(pending_draft.get("x", -1)) and int(item["z"]) == int(pending_draft.get("z", -1)):
		_clear_draft()
		_render_state()
		status.text = "배치안이 이미 반영됐어요"
		return
	if int(village_state.get("villageVersion", -1)) != int(pending_draft.get("baseVersion", -2)):
		status.text = "배치안 충돌 · 새 위치를 선택해 주세요"
		return
	var body: Dictionary = {"x": int(pending_draft["x"]), "z": int(pending_draft["z"]), "rotation": int(pending_draft["rotation"]), "villageVersion": int(pending_draft["baseVersion"])}
	var result := await _api(HTTPClient.METHOD_POST, "/v1/items/" + str(pending_draft["itemId"]) + "/place", body)
	if result.has("error"):
		status.text = "배치안 동기화 대기 · 다시 시도해 주세요"
		return
	if crafted_item == str(pending_draft["itemId"]):
		crafted_item = ""
		_set_action_text("만들기")
	editing_item = ""
	_clear_draft()
	village_state = result
	_save_session()
	_render_state()
	status.text = "오프라인 배치안이 반영됐어요"

func _load_catalog() -> void:
	var content := await _api(HTTPClient.METHOD_GET, "/v1/content")
	if content.has("error"):
		return
	recipe_ids.clear()
	recipe_catalog.clear()
	for entry in content.get("catalog", []):
		if entry is Dictionary:
			recipe_ids.append(str(entry.get("id", "")))
			recipe_catalog.append(entry)
	_save_session()
	if active_tab == "decorate":
		_show_tab("decorate")

func _build_world() -> void:
	var sunlight := DirectionalLight3D.new()
	sunlight.rotation_degrees = Vector3(-55, -30, 0)
	sunlight.light_energy = 1.0
	add_child(sunlight)
	var environment := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("deede3")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color.WHITE
	env.ambient_light_energy = 0.55
	environment.environment = env
	add_child(environment)
	ground = MeshInstance3D.new()
	var plane := BoxMesh.new()
	plane.size = Vector3(grid_size, 0.2, grid_size)
	ground.mesh = plane
	ground.material_override = _material(COLORS["ground"])
	ground.position = Vector3(0, -0.1, 0)
	add_child(ground)
	var meadow := MeshInstance3D.new()
	var meadow_mesh := CylinderMesh.new()
	meadow_mesh.top_radius = 9.5
	meadow_mesh.bottom_radius = 10.0
	meadow_mesh.height = 0.35
	meadow.mesh = meadow_mesh
	meadow.material_override = _material(Color("7ea370"))
	meadow.position = Vector3(0, -0.37, 0)
	add_child(meadow)
	objects = Node3D.new()
	add_child(objects)
	for i in range(9):
		_queue_decoration("path", COLORS["road"], Vector3(i - 4, 0.025, 0.08 if i % 2 == 0 else -0.07), deg_to_rad(float(i * 13)))
	var tree_spots := [Vector2(-5.3, -5.2), Vector2(-2.5, -5.35), Vector2(1.7, -5.35), Vector2(5.25, -4.6), Vector2(5.3, -0.8), Vector2(5.3, 3.6), Vector2(3.2, 5.3), Vector2(-0.5, 5.35), Vector2(-4.3, 5.2), Vector2(-5.35, 1.4)]
	for index in range(tree_spots.size()):
		_add_tree(tree_spots[index], index)
	for i in range(30):
		var angle := float(i) * 2.39996
		var radius := 5.6 + float(i % 3) * 0.24
		_add_flower(Vector2(cos(angle) * radius, sin(angle) * radius), i)
	for i in range(27):
		var meadow_spot := Vector2(sin(float(i) * 7.13) * 4.8, sin(float(i) * 3.79) * 4.8)
		if abs(meadow_spot.y) > 0.85 and meadow_spot.length() > 2.2:
			_add_flower(meadow_spot, i)
	for spot in [Vector2(-4.4, -3.7), Vector2(-4.5, 3.9), Vector2(4.5, -3.7), Vector2(4.5, 4.1)]:
		_add_shrub(spot)
	_flush_decorations()
	resident_root = Node3D.new()
	add_child(resident_root)
	orbit = Node3D.new()
	add_child(orbit)
	camera = Camera3D.new()
	camera.current = true
	orbit.add_child(camera)
	_update_camera()

func _material(color: Color) -> StandardMaterial3D:
	var key := color.to_html(true)
	if material_cache.has(key):
		return material_cache[key]
	var result := StandardMaterial3D.new()
	result.albedo_color = color
	result.roughness = 1.0
	material_cache[key] = result
	return result

func _decorative_mesh(kind: String) -> Mesh:
	if decorative_meshes.has(kind):
		return decorative_meshes[kind]
	var mesh: Mesh
	if kind == "path" or kind == "trunk" or kind == "flower_stem":
		var cylinder := CylinderMesh.new()
		cylinder.radial_segments = 12
		if kind == "path":
			cylinder.top_radius = 0.47
			cylinder.bottom_radius = 0.49
			cylinder.height = 0.04
			cylinder.radial_segments = 7
		elif kind == "trunk":
			cylinder.top_radius = 0.11
			cylinder.bottom_radius = 0.18
			cylinder.height = 0.7
		else:
			cylinder.top_radius = 0.015
			cylinder.bottom_radius = 0.022
			cylinder.height = 0.22
			cylinder.radial_segments = 5
		mesh = cylinder
	else:
		var sphere := SphereMesh.new()
		sphere.radial_segments = 16
		sphere.rings = 8
		match kind:
			"crown_large":
				sphere.radius = 0.48
				sphere.height = 0.96
			"crown_small":
				sphere.radius = 0.35
				sphere.height = 0.70
			"flower":
				sphere.radius = 0.075
				sphere.height = 0.12
			"flower_center":
				sphere.radius = 0.045
				sphere.height = 0.075
			"shrub":
				sphere.radius = 0.30
				sphere.height = 0.42
		mesh = sphere
	decorative_meshes[kind] = mesh
	return mesh

func _queue_decoration(kind: String, color: Color, position: Vector3, rotation_y: float = 0.0) -> void:
	var key := kind + ":" + color.to_html(true)
	if not decorative_batches.has(key):
		decorative_batches[key] = {"kind": kind, "color": color, "transforms": []}
	var transforms: Array = decorative_batches[key]["transforms"]
	transforms.append(Transform3D(Basis(Vector3.UP, rotation_y), position))

func _flush_decorations() -> void:
	for key in decorative_batches:
		var batch: Dictionary = decorative_batches[key]
		var transforms: Array = batch["transforms"]
		var multi_mesh := MultiMesh.new()
		multi_mesh.transform_format = MultiMesh.TRANSFORM_3D
		multi_mesh.mesh = _decorative_mesh(str(batch["kind"]))
		multi_mesh.instance_count = transforms.size()
		for index in range(transforms.size()):
			multi_mesh.set_instance_transform(index, transforms[index])
		var instance := MultiMeshInstance3D.new()
		instance.multimesh = multi_mesh
		instance.material_override = _material(batch["color"])
		add_child(instance)
	decorative_batches.clear()

func _add_tree(spot: Vector2, index: int) -> void:
	_queue_decoration("trunk", Color("9b7859"), Vector3(spot.x, 0.34, spot.y))
	var crown_color := Color("e5b2ac") if index in [0, 3, 6] else (Color("dec47e") if index in [4, 8] else Color("78a88a"))
	var leaf_color := Color("f2cebd") if index in [0, 3, 6] else (Color("f0dfa0") if index in [4, 8] else Color("9cbd84"))
	for part in range(3):
		_queue_decoration("crown_large" if part == 0 else "crown_small", crown_color if part == 0 else leaf_color, Vector3(spot.x + (part - 1) * 0.25, 0.82 + (part % 2) * 0.28, spot.y))

func _add_flower(spot: Vector2, index: int) -> void:
	var petal_color := Color("eeb5aa") if index % 3 == 0 else (Color("f5dc8d") if index % 3 == 1 else Color("f6eee4"))
	_queue_decoration("flower_stem", Color("669867"), Vector3(spot.x, 0.12, spot.y))
	for petal in range(4):
		var angle := float(petal) * PI / 2.0
		_queue_decoration("flower", petal_color, Vector3(spot.x + cos(angle) * 0.075, 0.25, spot.y + sin(angle) * 0.075))
	_queue_decoration("flower_center", Color("e3aa66"), Vector3(spot.x, 0.27, spot.y))

func _add_shrub(spot: Vector2) -> void:
	for part in range(3):
		_queue_decoration("shrub", Color("74a773") if part == 0 else Color("88b884"), Vector3(spot.x + (part - 1) * 0.25, 0.20, spot.y + float(part % 2) * 0.18))
	for petal in range(3):
		_add_flower(spot + Vector2(float(petal - 1) * 0.18, -0.12), petal)

func _sync_residents() -> void:
	if not resident_root:
		return
	var unlocked: Array = village_state.get("residents", ["botta"])
	for id in resident_agents.keys():
		if not unlocked.has(id):
			resident_agents[id]["node"].queue_free()
			resident_agents.erase(id)
	for id in unlocked:
		if resident_agents.has(id):
			var agent: Dictionary = resident_agents[id]
			if str(agent.get("target_id", "")) != "":
				var target := _item_by_id(str(agent["target_id"]))
				if target.is_empty() or target.get("x") == null or Vector2i(int(target["x"]), int(target["z"])) != agent.get("target_cell"):
					agent["target_id"] = ""
					agent["path"] = []
					agent["use_left"] = 0.0
					var resident: Node3D = agent["node"]
					resident.position = agent.get("use_return", resident.position)
					resident.scale = Vector3.ONE
					resident.rotation.x = 0.0
					resident.rotation.z = 0.0
					(resident.get_node("Mood") as Label3D).visible = false
			continue
		var node: Node3D = ResidentModels.build(str(id))
		var mood := Label3D.new()
		mood.name = "Mood"
		mood.text = "✿"
		mood.font_size = 64
		mood.pixel_size = 0.012
		mood.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		mood.modulate = Color("a9674e")
		mood.position = Vector3(0, 1.55, 0)
		mood.scale = Vector3.ONE * 1.25
		mood.visible = false
		node.add_child(mood)
		var at := Vector2i(6, 3) if id == "botta" else Vector2i(3, 7) if id == "todam" else Vector2i(8, 7)
		node.position = Vector3(at.x - 5.5, 0, at.y - 5.5)
		resident_root.add_child(node)
		resident_agents[id] = {"node": node, "path": [], "target_id": "", "target_cell": Vector2i(-1, -1), "use_left": 0.0, "pause_left": 0.0, "use_return": node.position, "use_kind": ""}
		dialogue_cursor[id] = 0

func _item_by_id(id: String) -> Dictionary:
	for item in village_state.get("items", []):
		if item is Dictionary and str(item.get("id", "")) == id:
			return item
	return {}

func _route(start: Vector2i, goal: Vector2i) -> Array[Vector2i]:
	if start == goal:
		return []
	var frontier: Array[Vector2i] = [start]
	var came: Dictionary = {start: start}
	var head := 0
	while head < frontier.size():
		var current := frontier[head]
		head += 1
		if current == goal:
			break
		for step in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var next: Vector2i = current + step
			if next.x < 0 or next.y < 0 or next.x >= grid_size or next.y >= grid_size or came.has(next) or _cell_occupied(next):
				continue
			came[next] = current
			frontier.append(next)
	if not came.has(goal):
		return []
	var reverse_path: Array[Vector2i] = []
	var cursor := goal
	while cursor != start:
		reverse_path.append(cursor)
		cursor = came[cursor]
	reverse_path.reverse()
	return reverse_path

func _approach_cells(item: Dictionary) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	var x := int(item["x"])
	var z := int(item["z"])
	var width := 2 if str(item.get("recipe", "")) in ["workshop", "cottage", "tea_house"] else 1
	for offset in range(width):
		result.append(Vector2i(x - 1, z + offset))
		result.append(Vector2i(x + width, z + offset))
		result.append(Vector2i(x + offset, z - 1))
		result.append(Vector2i(x + offset, z + width))
	return result

func _plan_resident(id: String, agent: Dictionary) -> void:
	var node: Node3D = agent["node"]
	var start := Vector2i(roundi(node.position.x + 5.5), roundi(node.position.z + 5.5))
	var best_path: Array[Vector2i] = []
	var best_item: Dictionary = {}
	for preferred in ResidentModels.preferred_recipes(id):
		for item in village_state.get("items", []):
			if not item is Dictionary or str(item.get("recipe", "")) != preferred or item.get("x") == null:
				continue
			for approach in _approach_cells(item):
				if approach.x < 0 or approach.y < 0 or approach.x >= grid_size or approach.y >= grid_size or _cell_occupied(approach):
					continue
				var path := _route(start, approach)
				if path.is_empty() and start != approach:
					continue
				if best_item.is_empty() or path.size() < best_path.size():
					best_path = path
					best_item = item
		if not best_item.is_empty():
			break
	if best_item.is_empty():
		for attempt in range(8):
			var wander := Vector2i(randi_range(1, grid_size - 2), randi_range(1, grid_size - 2))
			if _cell_occupied(wander):
				continue
			var wandering_path := _route(start, wander)
			if not wandering_path.is_empty():
				agent["path"] = wandering_path
				return
		agent["pause_left"] = 2.0
		return
	agent["path"] = best_path
	agent["target_id"] = str(best_item["id"])
	agent["target_cell"] = Vector2i(int(best_item["x"]), int(best_item["z"]))

func _process(delta: float) -> void:
	for id in resident_agents.keys():
		var agent: Dictionary = resident_agents[id]
		var node: Node3D = agent["node"]
		if float(agent["pause_left"]) > 0.0:
			agent["pause_left"] = maxf(0.0, float(agent["pause_left"]) - delta)
			continue
		if float(agent["use_left"]) > 0.0:
			agent["use_left"] = maxf(0.0, float(agent["use_left"]) - delta)
			node.rotation.z = sin(float(Time.get_ticks_msec()) * 0.003) * 0.035
			if str(agent.get("use_kind", "")) == "garden":
				node.rotation.x = 0.15 + sin(float(Time.get_ticks_msec()) * 0.006) * 0.10
			if float(agent["use_left"]) == 0.0:
				node.position = agent.get("use_return", node.position)
				node.scale = Vector3.ONE
				node.rotation.x = 0.0
				node.rotation.z = 0.0
				(node.get_node("Mood") as Label3D).visible = false
				agent["target_id"] = ""
				agent["pause_left"] = 2.0
			continue
		var path: Array = agent["path"]
		if not path.is_empty():
			var cell: Vector2i = path[0]
			var destination := Vector3(cell.x - 5.5, 0.0, cell.y - 5.5)
			var before := node.position
			node.position = node.position.move_toward(destination, delta * (0.65 if id == "todam" else 0.9))
			var direction := destination - before
			if direction.length_squared() > 0.001:
				node.rotation.y = atan2(direction.x, direction.z)
			if node.position.distance_to(destination) < 0.02:
				path.pop_front()
		elif str(agent["target_id"]) != "":
			var target := _item_by_id(str(agent["target_id"]))
			if target.is_empty() or target.get("x") == null:
				agent["target_id"] = ""
				continue
			agent["use_left"] = 4.0
			agent["use_return"] = node.position
			var recipe := str(target.get("recipe", ""))
			agent["use_kind"] = "garden" if recipe in ["flowerbed", "planter"] else "sitting" if recipe in ["bench", "stool", "hammock", "table"] else "standing"
			var mood: Label3D = node.get_node("Mood")
			mood.text = "✿" if str(agent["use_kind"]) == "garden" else ("♪" if str(agent["use_kind"]) == "sitting" else "✦")
			mood.visible = true
			if str(agent["use_kind"]) == "sitting":
				node.position = Vector3(float(target["x"]) - 5.5, 0.21, float(target["z"]) - 5.43)
				node.scale = Vector3.ONE * 0.68
		else:
			_plan_resident(str(id), agent)

func _build_interface() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(root)
	var top_card := PanelContainer.new()
	top_card.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top_card.offset_left = 12
	top_card.offset_top = 10
	top_card.offset_right = -12
	top_card.offset_bottom = 90
	top_card.add_theme_stylebox_override("panel", _paper_style())
	root.add_child(top_card)
	var top := VBoxContainer.new()
	top.add_theme_constant_override("separation", 0)
	top_card.add_child(top)
	var header := HBoxContainer.new()
	top.add_child(header)
	var title := _ui_label("렛츠 플레오  ✿", 25, Color("3d5141"))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var retry_button := _ui_button("↻", "light", 20)
	retry_button.custom_minimum_size = Vector2(36, 32)
	retry_button.tooltip_text = "마을 다시 동기화"
	retry_button.pressed.connect(_sync)
	header.add_child(retry_button)
	status = _ui_label("마을을 불러오는 중...", 14, Color("6b7c64"))
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	top.add_child(status)
	resource_row = HBoxContainer.new()
	resource_row.set_anchors_preset(Control.PRESET_TOP_WIDE)
	resource_row.offset_left = 12
	resource_row.offset_top = 110
	resource_row.offset_right = -12
	resource_row.offset_bottom = 146
	resource_row.add_theme_constant_override("separation", 5)
	root.add_child(resource_row)
	_refresh_resources()
	village_label = _ui_label("", 14, Color("3d5141"))
	village_label.set_anchors_preset(Control.PRESET_TOP_LEFT)
	village_label.position = Vector2(20, 156)
	root.add_child(village_label)
	tutorial_card = PanelContainer.new()
	tutorial_card.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	tutorial_card.offset_left = 14
	tutorial_card.offset_right = -14
	tutorial_card.offset_top = -252
	tutorial_card.offset_bottom = -111
	tutorial_card.add_theme_stylebox_override("panel", _paper_style())
	tutorial_card.visible = false
	root.add_child(tutorial_card)
	var tutorial_stack := VBoxContainer.new()
	tutorial_stack.add_theme_constant_override("separation", 3)
	tutorial_card.add_child(tutorial_stack)
	tutorial_title = _ui_label("", 19, Color("3d5141"))
	tutorial_stack.add_child(tutorial_title)
	tutorial_hint = _ui_label("", 13, Color("6b7c64"))
	tutorial_stack.add_child(tutorial_hint)
	tutorial_button = _ui_button("", "primary", 15)
	tutorial_button.custom_minimum_size = Vector2(0, 42)
	tutorial_button.pressed.connect(_tutorial_next)
	tutorial_stack.add_child(tutorial_button)
	var zoom_row := HBoxContainer.new()
	zoom_row.set_anchors_preset(Control.PRESET_CENTER_RIGHT)
	zoom_row.offset_left = -56
	zoom_row.offset_right = -10
	zoom_row.offset_top = -90
	zoom_row.offset_bottom = 44
	zoom_row.add_theme_constant_override("separation", 8)
	zoom_row.alignment = BoxContainer.ALIGNMENT_CENTER
	root.add_child(zoom_row)
	var zoom_stack := VBoxContainer.new()
	zoom_stack.add_theme_constant_override("separation", 7)
	zoom_row.add_child(zoom_stack)
	for direction in ["+", "−"]:
		var zoom_button := _ui_button(direction, "light", 18)
		zoom_button.custom_minimum_size = Vector2(44, 44)
		zoom_button.pressed.connect(func() -> void: _camera_step(direction))
		zoom_stack.add_child(zoom_button)
	sheet = PanelContainer.new()
	sheet.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	sheet.offset_left = 8
	sheet.offset_right = -8
	sheet.offset_top = -505
	sheet.offset_bottom = -108
	sheet.add_theme_stylebox_override("panel", _paper_style())
	sheet.visible = false
	root.add_child(sheet)
	sheet_body = VBoxContainer.new()
	sheet_body.add_theme_constant_override("separation", 9)
	sheet.add_child(sheet_body)
	var dock := PanelContainer.new()
	dock.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	dock.offset_left = 8
	dock.offset_right = -8
	dock.offset_top = -100
	dock.offset_bottom = -8
	dock.add_theme_stylebox_override("panel", _paper_style())
	root.add_child(dock)
	var nav := HBoxContainer.new()
	nav.add_theme_constant_override("separation", 5)
	dock.add_child(nav)
	for tab in ["village", "decorate", "today", "travel"]:
		var captions: Dictionary = {"village": "⌂\n마을", "decorate": "✿\n꾸미기", "today": "☀\n오늘", "travel": "✦\n여행"}
		var button := _ui_button(str(captions[tab]), "nav", 15)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.custom_minimum_size = Vector2(0, 62)
		button.pressed.connect(func() -> void: _show_tab(tab))
		nav.add_child(button)
		tab_buttons[tab] = button
	_show_tab("village")

func _ui_label(value: String, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = value
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	return label

func _set_action_text(value: String) -> void:
	if is_instance_valid(action_button):
		action_button.text = value

func _placement_error(error_code: String) -> String:
	match error_code:
		"OCCUPIED": return "이미 가구가 있는 자리예요"
		"OUT_OF_BOUNDS": return "마을 밖에는 놓을 수 없어요"
		"ENTRANCE_BLOCKED": return "입구가 막혀요 · 다른 자리를 골라 주세요"
		"STALE": return "마을이 바뀌었어요 · ↻로 새로고침"
	return "놓을 수 없어요 · ↻로 다시 시도"

func _craft_error(error_code: String) -> String:
	match error_code:
		"INSUFFICIENT_MATERIALS": return "재료가 모자라요 · 오늘 탭에서 정원을 돌봐 주세요"
		"INVALID_CRAFT": return "이 물건은 만들 수 없어요 · 다시 선택해 주세요"
		"NETWORK_UNAVAILABLE": return "연결이 끊겼어요 · ↻로 확인하고 다시 시도"
		"UNAUTHORIZED": return "마을 연결이 끊겼어요 · ↻로 다시 확인"
	return "만들지 못했어요 · ↻로 확인하고 다시 시도"

func _box(color: Color, radius: int, border: Color = Color.TRANSPARENT) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(radius)
	style.set_content_margin_all(10)
	style.border_color = border
	if border.a > 0.0:
		style.set_border_width_all(1)
	return style

func _paper_style() -> StyleBoxFlat:
	var style := _box(Color("fff8e9"), 24, Color("e8d9bb"))
	style.set_content_margin_all(13)
	style.shadow_color = Color(0.27, 0.35, 0.25, 0.16)
	style.shadow_size = 7
	style.shadow_offset = Vector2(0, 3)
	return style

func _ui_button(value: String, variant: String = "light", font_size: int = 15) -> Button:
	var button := Button.new()
	button.text = value
	button.add_theme_font_size_override("font_size", font_size)
	button.add_theme_color_override("font_color", Color("3d5141"))
	button.add_theme_color_override("font_hover_color", Color("3d5141"))
	button.add_theme_color_override("font_pressed_color", Color("3d5141"))
	button.add_theme_color_override("font_disabled_color", Color("8e9c88"))
	var background := Color("fffdf4")
	var outline := Color("e4d9c1")
	if variant == "primary":
		background = Color("ed9c70")
		outline = Color("d9825c")
	elif variant == "selected":
		background = Color("cce3bd")
		outline = Color("89b58c")
	elif variant == "nav":
		background = Color("fff8e9")
		outline = Color.TRANSPARENT
	elif variant == "garden":
		background = Color("eef5e5")
		outline = Color("c8dabb")
	elif variant == "glow":
		background = Color("fff3d9")
		outline = Color("ead3a0")
	elif variant == "cozy":
		background = Color("fff0e7")
		outline = Color("eacbb9")
	elif variant == "travel":
		background = Color("edf2ed")
		outline = Color("c9d9ce")
	button.add_theme_stylebox_override("normal", _box(background, 17, outline))
	button.add_theme_stylebox_override("hover", _box(background.lightened(0.08), 17, outline))
	button.add_theme_stylebox_override("pressed", _box(background.darkened(0.08), 17, outline))
	button.add_theme_stylebox_override("disabled", _box(Color("ece9dc"), 17))
	button.add_theme_stylebox_override("focus", _box(Color.TRANSPARENT, 17, Color("78a887")))
	return button

func _refresh_resources() -> void:
	if not resource_row:
		return
	for child in resource_row.get_children():
		child.queue_free()
	var inv: Dictionary = village_state.get("inventory", {})
	var tokens: Array = [["나무", "wood", "b98158"], ["돌", "stone", "a2a8a1"], ["천", "fabric", "ed9c70"], ["씨앗", "seed", "78a887"]]
	for entry in tokens:
		var chip := PanelContainer.new()
		chip.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		chip.add_theme_stylebox_override("panel", _box(Color("fff8e9"), 15))
		var label := _ui_label("● %s %d" % [entry[0], int(inv.get(entry[1], 0))], 13, Color("3d5141"))
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		chip.add_child(label)
		resource_row.add_child(chip)

func _show_tab(tab: String) -> void:
	active_tab = tab
	sheet.visible = tab != "village"
	_refresh_tutorial()
	sheet.offset_top = -505 if tab == "decorate" else (-455 if tab == "today" else -535)
	for key in tab_buttons.keys():
		var button: Button = tab_buttons[key]
		if is_instance_valid(button):
			button.add_theme_stylebox_override("normal", _box(Color("cce3bd") if key == tab else Color("fff8e9"), 17))
	if tab == "village":
		return
	for child in sheet_body.get_children():
		sheet_body.remove_child(child)
		child.queue_free()
	action_button = null
	garden_button = null
	quest_button = null
	if tab == "decorate":
		_build_decorate_panel()
	elif tab == "today":
		_build_today_panel()
	else:
		_build_travel_panel()

func _refresh_tutorial() -> void:
	if not is_instance_valid(tutorial_card):
		return
	tutorial_card.visible = false
	if active_tab != "village" or village_state.is_empty():
		return
	var pending := _pending_travel_materials()
	if not pending.is_empty():
		tutorial_title.text = "길에서 온 선물이 도착했어요  ✦"
		tutorial_hint.text = _material_text(pending)
		tutorial_button.text = "여행 가방 열기"
		tutorial_action = "travel"
		tutorial_card.visible = true
		return
	if not journey_reward.is_empty():
		var recipe := str(journey_reward.get("recipe", ""))
		tutorial_title.text = "이번 여행을 마을에 남겨요  ✿"
		tutorial_hint.text = "받은 재료로 %s을 만들어볼까요?" % _recipe_name(recipe)
		tutorial_button.text = "%s 만들기" % _recipe_name(recipe)
		tutorial_action = recipe
		tutorial_card.visible = true
		return
	if intro_completed:
		return
	var placed: Array = village_state.get("items", [])
	var has_bench := false
	var has_flowerbed := false
	for item in placed:
		if item is Dictionary and item.get("x") != null:
			has_bench = has_bench or item.get("recipe") == "bench"
			has_flowerbed = has_flowerbed or item.get("recipe") == "flowerbed"
	var claimed_first := false
	var first_available := false
	var second_available := false
	for quest in village_state.get("quests", []):
		if quest is Dictionary and quest.get("id") == "q01":
			claimed_first = quest.get("claimed", false)
			first_available = quest.get("available", false)
		elif quest is Dictionary and quest.get("id") == "q02":
			if quest.get("claimed", false):
				intro_completed = true
				return
			second_available = quest.get("available", false)
	if not has_bench:
		tutorial_title.text = "첫 쉼터를 만들어볼까요?  ✿"
		tutorial_hint.text = "여행 벤치를 만들고 마을의 빈 자리에 놓아요."
		tutorial_button.text = "벤치 만들러 가기"
		tutorial_action = "bench"
	elif first_available or second_available:
		tutorial_title.text = "주민의 선물이 도착했어요  ✦"
		tutorial_hint.text = "오늘의 의뢰에서 보상을 받아보세요."
		tutorial_button.text = "의뢰 보러 가기"
		tutorial_action = "today"
	elif claimed_first and not has_flowerbed:
		tutorial_title.text = "정원에 꽃을 심어볼까요?  ✿"
		tutorial_hint.text = "꽃 화단을 놓으면 새 주민을 만날 수 있어요."
		tutorial_button.text = "꽃 화단 만들기"
		tutorial_action = "flowerbed"
	else:
		return
	tutorial_card.visible = true

func _tutorial_next() -> void:
	if tutorial_action in ["today", "travel"]:
		_show_tab(tutorial_action)
	elif tutorial_action != "":
		_choose_recipe(tutorial_action)

func _build_decorate_panel() -> void:
	sheet_body.add_child(_ui_label("꾸미기 공방  ✿", 23, Color("3d5141")))
	var subtitle := "가구를 길게 눌러 편집하거나 새 가구를 골라보세요"
	if crafted_item != "":
		subtitle = "마을의 빈 자리를 눌러 만든 가구를 놓아보세요"
	elif editing_item != "":
		subtitle = "빈 자리를 누른 뒤 이동을 확정하세요"
	sheet_body.add_child(_ui_label(subtitle, 13, Color("6b7c64")))
	action_button = _ui_button("이동 확정" if editing_item != "" else ("마을에 놓기" if crafted_item != "" else "선택한 가구 만들기"), "primary", 17)
	action_button.custom_minimum_size = Vector2(0, 50)
	action_button.pressed.connect(_craft_or_place)
	sheet_body.add_child(action_button)
	var edit_row := HBoxContainer.new()
	edit_row.add_theme_constant_override("separation", 6)
	sheet_body.add_child(edit_row)
	for edit_action in ["이동", "회전", "보관"]:
		var edit_button := _ui_button(edit_action, "light", 14)
		edit_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		edit_button.custom_minimum_size = Vector2(0, 42)
		edit_button.pressed.connect(func() -> void: _edit_selected(edit_action))
		edit_row.add_child(edit_button)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	sheet_body.add_child(scroll)
	var grid := GridContainer.new()
	grid.columns = 2
	grid.add_theme_constant_override("h_separation", 7)
	grid.add_theme_constant_override("v_separation", 7)
	grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(grid)
	if recipe_catalog.is_empty():
		grid.add_child(_ui_label("가구 목록 연결 대기 · ↻로 다시 시도", 15, Color("6b7c64")))
	for entry in recipe_catalog:
		var id := str(entry.get("id", ""))
		var cost: Dictionary = entry.get("cost", {})
		var tags: Array = entry.get("tags", [])
		var parts: Array[String] = []
		for material in ["wood", "stone", "fabric", "seed"]:
			if cost.has(material):
				parts.append("%s%d" % [{"wood": "나", "stone": "돌", "fabric": "천", "seed": "씨"}[material], int(cost[material])])
		var card_variant := "selected" if id == selected_recipe else ("garden" if tags.has("garden") else ("glow" if tags.has("light") or tags.has("star") else ("cozy" if tags.has("cozy") or tags.has("rest") else ("travel" if tags.has("travel") or str(entry.get("kind", "")) == "building" else "light"))))
		var card := _ui_button("", card_variant, 14)
		card.mouse_filter = Control.MOUSE_FILTER_PASS
		card.custom_minimum_size = Vector2(164, 148)
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.pressed.connect(func() -> void: _choose_recipe(id))
		grid.add_child(card)
		var content := VBoxContainer.new()
		content.mouse_filter = Control.MOUSE_FILTER_IGNORE
		content.add_theme_constant_override("separation", 2)
		card.add_child(content)
		content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		content.offset_left = 8
		content.offset_right = -8
		content.offset_top = 6
		content.offset_bottom = -8
		var preview := TextureRect.new()
		preview.mouse_filter = Control.MOUSE_FILTER_IGNORE
		preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		preview.custom_minimum_size = Vector2(0, 86)
		if not recipe_previews.has(id):
			recipe_previews[id] = load("res://art/catalog/%s.png" % id)
		preview.texture = recipe_previews[id]
		content.add_child(preview)
		var title := _ui_label(str(entry.get("name", id)), 14, Color("3d5141"))
		title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		content.add_child(title)
		var price := _ui_label(" · ".join(parts), 11, Color("6b7c64"))
		price.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		content.add_child(price)

func _build_today_panel() -> void:
	sheet_body.add_child(_ui_label("오늘의 작은 일  ☀", 23, Color("3d5141")))
	sheet_body.add_child(_ui_label("잠깐 들러도 마을은 자라요.", 14, Color("6b7c64")))
	var garden: Dictionary = village_state.get("garden", {})
	sheet_body.add_child(_ui_label("✿  정원", 18, Color("3d5141")))
	sheet_body.add_child(_ui_label("하루에 한 번, 마을의 재료를 모아보세요.", 14, Color("6b7c64")))
	garden_button = _ui_button("오늘 수확 완료" if garden.get("harvestedToday", false) else "정원 수확하기", "primary", 16)
	garden_button.custom_minimum_size = Vector2(0, 50)
	garden_button.disabled = garden.get("harvestedToday", false)
	garden_button.pressed.connect(_harvest_garden)
	sheet_body.add_child(garden_button)
	sheet_body.add_child(_ui_label("✦  주민의 의뢰", 18, Color("3d5141")))
	var quest_text := "의뢰를 모두 완료했어요"
	var available := false
	for quest in village_state.get("quests", []):
		if quest is Dictionary and not quest.get("claimed", false):
			quest_text = str(quest.get("description", "의뢰를 확인해 주세요"))
			available = quest.get("available", false)
			break
	sheet_body.add_child(_ui_label(quest_text, 14, Color("6b7c64")))
	quest_button = _ui_button("선물 받기" if available else "의뢰 확인", "selected" if available else "light", 16)
	quest_button.custom_minimum_size = Vector2(0, 50)
	quest_button.pressed.connect(_claim_quest)
	sheet_body.add_child(quest_button)

func _pending_travel_materials() -> Dictionary:
	var total: Dictionary = {}
	for grant in village_state.get("grants", []):
		if grant.get("claimed_at") != null:
			continue
		for material in grant.get("materials", {}):
			total[material] = int(total.get(material, 0)) + int(grant.materials[material])
	return total

func _material_text(amounts: Dictionary) -> String:
	var parts: Array[String] = []
	for entry in [["wood", "나무"], ["stone", "돌"], ["fabric", "천"], ["seed", "씨앗"]]:
		if int(amounts.get(entry[0], 0)) > 0:
			parts.append("%s +%d" % [entry[1], int(amounts[entry[0]])])
	return " · ".join(parts)

func _recipe_name(id: String) -> String:
	for entry in recipe_catalog:
		if str(entry.get("id", "")) == id:
			return str(entry.get("name", id))
	return {"flowerbed": "꽃 화단", "bench": "여행 벤치", "stool": "작은 의자"}.get(id, id)

func _travel_recipe(materials: Dictionary) -> String:
	for id in ["flowerbed", "bench", "stool", "lamp", "planter"]:
		for entry in recipe_catalog:
			if str(entry.get("id", "")) != id:
				continue
			var enough := true
			for key in entry.get("cost", {}):
				if int(materials.get(key, 0)) < int(entry.cost[key]):
					enough = false
			if enough:
				return id
	return ""

func _build_travel_panel() -> void:
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	sheet_body.add_child(scroll)
	var travel_body := VBoxContainer.new()
	travel_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	travel_body.add_theme_constant_override("separation", 9)
	scroll.add_child(travel_body)
	travel_body.add_child(_ui_label("길에서 온 여행 가방  ✦", 23, Color("3d5141")))
	var journeys: Array = village_state.get("journeys", [])
	if not journeys.is_empty():
		var seconds := int(journeys[0].get("moving_seconds", 0))
		travel_body.add_child(_ui_label("최근 여행 · 이동 %d분 %02d초" % [seconds / 60, seconds % 60], 16, Color("6b7c64")))
	else:
		travel_body.add_child(_ui_label("차에서 탐험을 시작하면 여기에 도착해요.", 14, Color("6b7c64")))
	var pending := _pending_travel_materials()
	var displayed: Dictionary = pending if not pending.is_empty() else journey_reward.get("materials", {})
	var recommendation := _travel_recipe(displayed)
	if not displayed.is_empty():
		travel_body.add_child(_ui_label("꾸러미 속 재료" if not pending.is_empty() else "이번에 받은 여행 재료", 18, Color("3d5141")))
		var material_line := _ui_label(_material_text(displayed), 14, Color("6b7c64"))
		material_line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		travel_body.add_child(material_line)
		if recommendation != "":
			var preview_row := HBoxContainer.new()
			var preview := TextureRect.new()
			preview.custom_minimum_size = Vector2(76, 76)
			preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
			preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
			preview.texture = load("res://art/catalog/%s.png" % recommendation)
			preview_row.add_child(preview)
			var hint := _ui_label("이 여행으로 만드는\n" + _recipe_name(recommendation), 17, Color("3d5141"))
			preview_row.add_child(hint)
			travel_body.add_child(preview_row)
	else:
		var empty_hint := _ui_label("열지 않은 꾸러미가 없어요.\n평소 이동을 기록하고 도착 후 다시 확인하세요.", 14, Color("6b7c64"))
		empty_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		travel_body.add_child(empty_hint)
	var refresh := _ui_button("여행 꾸러미 열기" if not pending.is_empty() else ("%s 만들러 가기" % _recipe_name(recommendation) if recommendation != "" else "여행 기록 새로고침"), "primary", 17)
	refresh.mouse_filter = Control.MOUSE_FILTER_PASS
	refresh.custom_minimum_size = Vector2(0, 54)
	if pending.is_empty() and recommendation != "":
		refresh.pressed.connect(func() -> void: _choose_recipe(recommendation))
	else:
		refresh.pressed.connect(_claim_and_sync)
	travel_body.add_child(refresh)
	travel_body.add_child(_ui_label("차량을 처음 연결하나요?", 17, Color("3d5141")))
	travel_body.add_child(_ui_label("아래 코드를 정차한 차량 화면에 입력하세요.", 14, Color("6b7c64")))
	var pair_button := _ui_button("연결 코드  " + pair_code_value if pair_code_value != "" else "차량 연결 코드 보기", "selected" if pair_code_value != "" else "light", 19 if pair_code_value != "" else 16)
	pair_button.mouse_filter = Control.MOUSE_FILTER_PASS
	pair_button.custom_minimum_size = Vector2(0, 54)
	pair_button.pressed.connect(_show_pair_code)
	travel_body.add_child(pair_button)

	travel_body.add_child(_ui_label("풍경 조각 · 색 제작법", 18, Color("3d5141")))
	var hint := _ui_label("주행 하루 1개 · 주민 의뢰에서도 얻어요.
가구를 길게 선택한 뒤 색을 입혀보세요.", 13, Color("6b7c64"))
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	travel_body.add_child(hint)
	for entry in village_state.get("scenery", []):
		var theme := str(entry.get("theme", ""))
		var name := str({"city": "도시", "forest": "숲", "sea": "바다"}.get(theme, theme))
		var unlocked := bool(entry.get("unlocked", false))
		var caption := name + "색 입히기" if unlocked else "%s 조각 %d · 제작법 열기 (1개)" % [name, int(entry.get("fragments", 0))]
		var button := _ui_button(caption, "selected" if unlocked else "light", 15)
		button.mouse_filter = Control.MOUSE_FILTER_PASS
		button.custom_minimum_size = Vector2(0, 48)
		button.pressed.connect(func() -> void: _scenery_action(theme, unlocked))
		travel_body.add_child(button)

func _scenery_action(theme: String, unlocked: bool) -> void:
	var path := "/v1/styles/" + theme + "/unlock"
	var body: Dictionary = {}
	if unlocked:
		if _selected_item().is_empty():
			status.text = "마을에서 가구를 길게 눌러 선택해 주세요"
			return
		path = "/v1/items/" + selected_item + "/style"
		body = {"theme": theme, "villageVersion": int(village_state.get("villageVersion", 0))}
	var response := await _api(HTTPClient.METHOD_POST, path, body)
	if response.has("error"):
		status.text = "조각이 부족해요 · 주민 의뢰를 완료해 보세요" if str(response["error"]) == "INSUFFICIENT_FRAGMENTS" else "색을 바꾸지 못했어요 · ↻로 확인 후 다시 시도"
		return
	village_state = response
	_save_session()
	_render_state()
	status.text = "가구에 새로운 색을 입혔어요" if unlocked else "색 제작법을 열었어요 · 가구를 선택해 보세요"

func _choose_recipe(id: String) -> void:
	if crafted_item != "":
		status.text = "먼저 만든 가구를 마을의 빈 자리에 놓아 주세요"
		_show_tab("decorate")
		return
	selected_recipe = id
	for entry in recipe_catalog:
		if str(entry.get("id", "")) == id:
			status.text = str(entry.get("name", id)) + " 선택"
			break
	_show_tab("decorate")

func _render_state() -> void:
	grid_size = int(village_state.get("gridSize", INITIAL_GRID))
	if ground:
		(ground.mesh as BoxMesh).size = Vector3(grid_size, 0.2, grid_size)
		ground.position = Vector3((grid_size - INITIAL_GRID) / 2.0, -0.1, (grid_size - INITIAL_GRID) / 2.0)
	_refresh_resources()
	if village_label:
		var resident_list: Array = village_state.get("residents", ["botta"])
		var quest_list: Array = village_state.get("quests", [])
		var completed := 0
		for quest in quest_list:
			if quest is Dictionary and quest.get("claimed", false):
				completed += 1
		village_label.text = "마을 %d×%d · 주민 %d명 · 의뢰 %d/14" % [grid_size, grid_size, resident_list.size(), completed]
		if not pending_draft.is_empty():
			village_label.text += " · 미확정 배치안"
	if is_instance_valid(garden_button):
		garden_button.disabled = village_state.get("garden", {}).get("harvestedToday", false)
		garden_button.text = "오늘 수확 완료" if garden_button.disabled else "정원 수확"
	if is_instance_valid(quest_button):
		var available := false
		for quest in village_state.get("quests", []):
			if quest is Dictionary and quest.get("available", false):
				available = true
		quest_button.text = "의뢰 완료" if available else "의뢰 확인"
	if crafted_item == "":
		for item in village_state.get("items", []):
			if item is Dictionary and item.get("x") == null:
				crafted_item = str(item.get("id", ""))
				placement_rotation = int(item.get("rotation", 0))
				placement_cell = _first_open_cell()
				break
	if objects:
		for child in objects.get_children():
			child.queue_free()
		for item in village_state.get("items", []):
			if item is Dictionary and item.get("x") != null:
				_build_item(item)
		_build_draft_preview()
	_sync_residents()
	_show_tab(active_tab)
	call_deferred("_refresh_tutorial")

func _build_draft_preview() -> void:
	if pending_draft.is_empty():
		return
	var item := _item_by_id(str(pending_draft.get("itemId", "")))
	if item.is_empty():
		return
	var recipe := str(item.get("recipe", "bench"))
	var offset := 0.5 if recipe in ["workshop", "cottage", "tea_house"] else 0.0
	var preview: Node3D = VillageModels.build(recipe)
	preview.position = Vector3(float(pending_draft["x"]) - 5.5 + offset, 0, float(pending_draft["z"]) - 5.5 + offset)
	preview.rotation_degrees.y = float(pending_draft.get("rotation", 0))
	for child in preview.get_children():
		if child is MeshInstance3D and child.material_override is StandardMaterial3D:
			var material: StandardMaterial3D = child.material_override.duplicate()
			material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
			material.albedo_color.a = 0.45
			child.material_override = material
	objects.add_child(preview)

func _build_item(item: Dictionary) -> void:
	var recipe := str(item.get("recipe", "bench"))
	var building := recipe in ["workshop", "cottage", "tea_house"]
	var offset := 0.5 if building else 0.0
	var at := Vector3(float(item["x"]) - 5.5 + offset, 0.0, float(item["z"]) - 5.5 + offset)
	var instance: Node3D = VillageModels.build(recipe)
	instance.set_meta("item_id", str(item.get("id", "")))
	var style := str(item.get("style", ""))
	var palette := {"city": Color("e6a277"), "forest": Color("69a47c"), "sea": Color("71b5d0")}
	if palette.has(style):
		for child in instance.get_children():
			if child is MeshInstance3D and child.material_override is StandardMaterial3D:
				var colored: StandardMaterial3D = child.material_override.duplicate()
				colored.albedo_color = colored.albedo_color.lerp(palette[style], 0.55)
				child.material_override = colored
	instance.position = at
	instance.rotation_degrees.y = float(item.get("rotation", 0))
	objects.add_child(instance)

func _craft_or_place() -> void:
	if token == "":
		_sync()
		return
	if editing_item != "":
		var item := _selected_item()
		if item.is_empty():
			status.text = "가구를 다시 선택해 주세요"
			return
		var moved := await _api(HTTPClient.METHOD_POST, "/v1/items/" + editing_item + "/place", {"x": placement_cell.x, "z": placement_cell.y, "rotation": int(item.get("rotation", 0)), "villageVersion": int(village_state.get("villageVersion", 0))})
		if moved.has("error"):
			if str(moved["error"]) == "NETWORK_UNAVAILABLE":
				pending_draft = {"itemId": editing_item, "x": placement_cell.x, "z": placement_cell.y, "rotation": int(item.get("rotation", 0)), "baseVersion": int(village_state.get("villageVersion", 0))}
				_save_draft()
				status.text = "오프라인 이동 배치안 저장 · 미확정"
				return
			status.text = _placement_error(str(moved["error"]))
			return
		_clear_draft()
		editing_item = ""
		_set_action_text("만들기")
		village_state = moved
		_save_session()
		_render_state()
		status.text = "가구를 옮겼어요"
		return
	if crafted_item == "":
		var response := await _api(HTTPClient.METHOD_POST, "/v1/craft", {"recipe": selected_recipe, "requestId": _uuid()})
		if response.has("error"):
			status.text = _craft_error(str(response["error"]))
			return
		crafted_item = str(response["itemId"])
		placement_rotation = 0
		placement_cell = _first_open_cell()
		_set_action_text("마을에 놓기")
		status.text = "만들었어요! 배치 위치 %d,%d" % [placement_cell.x, placement_cell.y]
		_sync()
	else:
		var version: int = int(village_state.get("villageVersion", 0))
		var placed_id := crafted_item
		var placed_recipe := str(_item_by_id(crafted_item).get("recipe", selected_recipe))
		var response := await _api(HTTPClient.METHOD_POST, "/v1/items/" + crafted_item + "/place", {"x": placement_cell.x, "z": placement_cell.y, "rotation": placement_rotation, "villageVersion": version})
		if response.has("error"):
			if str(response["error"]) == "NETWORK_UNAVAILABLE":
				pending_draft = {"itemId": crafted_item, "x": placement_cell.x, "z": placement_cell.y, "rotation": placement_rotation, "baseVersion": version}
				_save_draft()
				status.text = "오프라인 배치안 저장 · 미확정"
				return
			status.text = _placement_error(str(response["error"]))
			if str(response["error"]) == "OCCUPIED":
				placement_cell = _first_open_cell()
			return
		crafted_item = ""
		_set_action_text("만들기")
		_clear_draft()
		village_state = response
		var from_journey := not journey_reward.is_empty() and str(journey_reward.get("recipe", "")) == placed_recipe
		if from_journey:
			journey_reward = {}
		_save_session()
		_render_state()
		status.text = "오늘의 여행이 %s으로 남았어요" % _recipe_name(placed_recipe) if from_journey else "마을에 놓았어요"
		for node in objects.get_children():
			if str(node.get_meta("item_id", "")) == placed_id:
				node.scale = Vector3.ONE * 0.65
				create_tween().tween_property(node, "scale", Vector3.ONE, 0.45).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

func _cell_occupied(cell: Vector2i) -> bool:
	for item in village_state.get("items", []):
		if item is Dictionary and item.get("x") != null and item.get("z") != null:
			var width := 2 if str(item.get("recipe", "")) in ["workshop", "cottage", "tea_house"] else 1
			if cell.x >= int(item["x"]) and cell.x < int(item["x"]) + width and cell.y >= int(item["z"]) and cell.y < int(item["z"]) + width:
				return true
	return false

func _first_open_cell() -> Vector2i:
	var recipe := selected_recipe
	for item in village_state.get("items", []):
		if item is Dictionary and str(item.get("id", "")) == crafted_item:
			recipe = str(item.get("recipe", recipe))
	var width := 2 if recipe in ["workshop", "cottage", "tea_house"] else 1
	for radius in range(grid_size * 2):
		for z in range(grid_size):
			for x in range(grid_size):
				var cell := Vector2i(x, z)
				var clear := x + width <= grid_size and z + width <= grid_size
				for dz in range(width):
					for dx in range(width):
						if _cell_occupied(Vector2i(x + dx, z + dz)):
							clear = false
				if abs(x - 5) + abs(z - 5) == radius and clear:
					return cell
	return Vector2i(-1, -1)

func _select_cell(screen_position: Vector2, prefer_item: bool = false) -> void:
	if not camera:
		return
	var origin := camera.project_ray_origin(screen_position)
	var direction := camera.project_ray_normal(screen_position)
	if abs(direction.y) < 0.001:
		return
	var distance := -origin.y / direction.y
	if distance <= 0.0:
		return
	var hit := origin + direction * distance
	if not prefer_item:
		for id in resident_agents.keys():
			var resident: Node3D = resident_agents[id]["node"]
			var resident_screen := camera.unproject_position(resident.global_position + Vector3(0, 0.48, 0))
			if resident_screen.distance_to(screen_position) < 72.0:
				var lines: PackedStringArray = ResidentModels.dialogue(str(id))
				if not lines.is_empty():
					var index: int = int(dialogue_cursor.get(id, 0)) % lines.size()
					dialogue_cursor[id] = index + 1
					var name := str({"botta": "보따", "todam": "토담", "saemi": "새미"}.get(str(id), str(id)))
					status.text = "%s: %s" % [name, lines[index]]
				return
	var cell := Vector2i(roundi(hit.x + 5.5), roundi(hit.z + 5.5))
	if cell.x < 0 or cell.x >= grid_size or cell.y < 0 or cell.y >= grid_size:
		status.text = "마을 안의 자리를 선택해 주세요"
	elif (crafted_item == "" and editing_item == "") or (prefer_item and editing_item == ""):
		selected_item = ""
		for item in village_state.get("items", []):
			if item is Dictionary and item.get("x") != null and int(item["x"]) == cell.x and int(item["z"]) == cell.y:
				selected_item = str(item["id"])
				status.text = "가구 선택 · 이동·회전·보관 가능"
				break
		if selected_item == "":
			status.text = "빈 자리 %d,%d" % [cell.x, cell.y]
	elif _cell_occupied(cell):
		if editing_item != "" and _selected_item().get("x") == cell.x and _selected_item().get("z") == cell.y:
			placement_cell = cell
		else:
			status.text = "이미 사용 중인 자리예요"
	else:
		placement_cell = cell
		status.text = "배치 위치 %d,%d 선택" % [cell.x, cell.y]

func _selected_item() -> Dictionary:
	for item in village_state.get("items", []):
		if item is Dictionary and str(item.get("id", "")) == selected_item:
			return item
	return {}

func _edit_selected(action: String) -> void:
	var item := _selected_item()
	if item.is_empty() or item.get("x") == null:
		status.text = "먼저 마을의 가구를 눌러 주세요"
		return
	if action == "이동":
		editing_item = selected_item
		placement_cell = Vector2i(int(item["x"]), int(item["z"]))
		_set_action_text("이동 확정")
		status.text = "빈 자리를 누른 뒤 이동을 확정하세요"
		return
	var path := "/v1/items/" + selected_item + ("/store" if action == "보관" else "/place")
	var body: Dictionary = {"villageVersion": int(village_state.get("villageVersion", 0))}
	if action == "회전":
		body.merge({"x": int(item["x"]), "z": int(item["z"]), "rotation": (int(item.get("rotation", 0)) + 90) % 360})
	var response := await _api(HTTPClient.METHOD_POST, path, body)
	if response.has("error"):
		status.text = _placement_error(str(response["error"]))
		return
	if action == "보관":
		selected_item = ""
		editing_item = ""
	village_state = response
	_save_session()
	_render_state()
	status.text = "가구를 %s했어요" % ("보관" if action == "보관" else "회전")

func _claim_and_sync() -> void:
	var response := await _api(HTTPClient.METHOD_GET, "/v1/state")
	if response.has("error"):
		status.text = "여행 기록을 확인할 수 없어요 · ↻로 다시 시도"
		return
	var received: Dictionary = {}
	var failed := false
	for grant in response.get("grants", []):
		if grant is Dictionary and grant.get("claimed_at") == null:
			var result := await _api(HTTPClient.METHOD_POST, "/v1/grants/" + str(grant["id"]) + "/claim")
			if result.has("error"):
				failed = true
				break
			for key in result.get("inventory", {}):
				var added := int(result.inventory[key]) - int(response.get("inventory", {}).get(key, 0))
				if added > 0:
					received[key] = int(received.get(key, 0)) + added
			response = result
	if not received.is_empty():
		var recipe := _travel_recipe(received)
		journey_reward = {"materials": received, "recipe": recipe} if recipe != "" else {}
	village_state = response
	_save_session()
	_render_state()
	status.text = "일부 꾸러미를 열지 못했어요 · 다시 눌러 주세요" if failed else ("여행 재료 도착! 이제 마을에 남겨볼까요?" if not received.is_empty() else "새 꾸러미가 아직 없어요 · 다음 도착 후 확인하세요")

func _show_pair_code() -> void:
	if token == "":
		status.text = "계정 연결 대기 중"
		return
	var response := await _api(HTTPClient.METHOD_POST, "/v1/pair-code")
	if response.has("error"):
		status.text = "코드를 만들지 못했어요 · ↻로 연결 확인 후 다시 시도"
		return
	pair_code_value = str(response.get("code", ""))
	status.text = "차량 연결 코드가 준비됐어요"
	_show_tab("travel")

func _harvest_garden() -> void:
	if token == "":
		status.text = "서버 연결을 확인해 주세요"
		return
	var response := await _api(HTTPClient.METHOD_POST, "/v1/garden/harvest")
	if response.has("error"):
		status.text = "정원 수확 실패 · 동기화 후 다시 시도"
		return
	village_state = response
	_save_session()
	_render_state()
	status.text = "정원 재료를 모았어요" if response.get("harvested", false) else "오늘 수확은 완료했어요"

func _claim_quest() -> void:
	for quest in village_state.get("quests", []):
		if quest is Dictionary and quest.get("available", false):
			var response := await _api(HTTPClient.METHOD_POST, "/v1/quests/" + str(quest["id"]) + "/claim")
			if response.has("error"):
				status.text = "의뢰 완료 실패 · 동기화 후 다시 시도"
				return
			village_state = response
			_save_session()
			_render_state()
			if str(quest.get("id", "")) == "q02":
				intro_completed = true
				tutorial_card.hide()
			status.text = str(quest.get("name", "의뢰")) + " 완료!"
			return
	for quest in village_state.get("quests", []):
		if quest is Dictionary and not quest.get("claimed", false):
			status.text = str(quest.get("description", "의뢰를 확인해 주세요"))
			return
	status.text = "의뢰를 모두 완료했어요"

func _uuid() -> String:
	var bytes := Crypto.new().generate_random_bytes(16)
	var parts := PackedStringArray()
	for byte in bytes:
		parts.append("%02x" % byte)
	return "%s-%s-%s-%s-%s" % ["".join(parts.slice(0, 4)), "".join(parts.slice(4, 6)), "".join(parts.slice(6, 8)), "".join(parts.slice(8, 10)), "".join(parts.slice(10, 16))]

func _update_camera() -> void:
	if orbit:
		orbit.rotation = Vector3(pitch, yaw, 0)
	if camera:
		camera.position = Vector3(0, 0, zoom)
		camera.look_at(orbit.global_position)

func _pan_camera(delta: Vector2) -> void:
	if not camera or not orbit:
		return
	var right := camera.global_transform.basis.x
	var up := camera.global_transform.basis.y
	orbit.position -= Vector3(right.x, 0, right.z) * delta.x * 0.018
	orbit.position += Vector3(up.x, 0, up.z) * delta.y * 0.018
	orbit.position.x = clamp(orbit.position.x, -5.0, float(grid_size) - 7.0)
	orbit.position.z = clamp(orbit.position.z, -5.0, float(grid_size) - 7.0)
	_update_camera()

func _camera_step(direction: String) -> void:
	match direction:
		"◀": _pan_camera(Vector2(45, 0))
		"▶": _pan_camera(Vector2(-45, 0))
		"▲": _pan_camera(Vector2(0, -45))
		"▼": _pan_camera(Vector2(0, 45))
		"+":
			zoom = max(9.0, zoom - 1.5)
			_update_camera()
		"−":
			zoom = min(25.0, zoom + 1.5)
			_update_camera()

func _touch_center() -> Vector2:
	var center := Vector2.ZERO
	for point in touches.values():
		center += point
	return center / max(1, touches.size())

func _touch_distance() -> float:
	var points := touches.values()
	return points[0].distance_to(points[1]) if points.size() >= 2 else 0.0

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed:
			touches[event.index] = event.position
			touch_started_at[event.index] = Time.get_ticks_msec()
			if event.index == 0:
				drag_origin = event.position
		else:
			var was_single := touches.size() == 1
			var held_long := Time.get_ticks_msec() - int(touch_started_at.get(event.index, Time.get_ticks_msec())) >= 500
			touches.erase(event.index)
			touch_started_at.erase(event.index)
			if was_single and event.index == 0 and event.position.distance_to(drag_origin) < 15.0:
				_select_cell(event.position, held_long)
	elif event is InputEventScreenDrag:
		if touches.size() >= 2:
			var old_center := _touch_center()
			var old_distance := _touch_distance()
			touches[event.index] = event.position
			_pan_camera(_touch_center() - old_center)
			zoom = clamp(zoom - (_touch_distance() - old_distance) * 0.025, 9.0, 25.0)
			_update_camera()
		else:
			touches[event.index] = event.position
			yaw += event.relative.x * 0.007
			pitch = clamp(pitch + event.relative.y * 0.004, -1.2, -0.25)
			_update_camera()
	elif event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		yaw += event.relative.x * 0.007
		pitch = clamp(pitch + event.relative.y * 0.004, -1.2, -0.25)
		_update_camera()
	elif event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		_pan_camera(event.relative)
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT:
			mouse_origin = event.position
		elif event.button_index == MOUSE_BUTTON_WHEEL_UP:
			zoom = max(9.0, zoom - 1.0)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			zoom = min(25.0, zoom + 1.0)
		_update_camera()
	elif event is InputEventMouseButton and not event.pressed and event.button_index == MOUSE_BUTTON_LEFT and event.position.distance_to(mouse_origin) < 15.0:
		_select_cell(event.position)
