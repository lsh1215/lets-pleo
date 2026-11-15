extends RefCounted

const WOOD := Color("b98158")
const DARK := Color("423b34")
const CREAM := Color("f4e5c9")
const LEAF := Color("5f986f")
const SAGE := Color("8bb58a")
const PEACH := Color("f2bf93")
const SKY := Color("9cc8d7")

static func _material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 1.0
	return material

static func _sphere(root: Node3D, radius: float, position: Vector3, color: Color) -> void:
	var node := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radial_segments = 16
	mesh.rings = 8
	mesh.radius = radius
	mesh.height = radius * 2.0
	node.mesh = mesh
	node.position = position
	node.material_override = _material(color)
	root.add_child(node)

static func _box(root: Node3D, size: Vector3, position: Vector3, color: Color) -> void:
	var node := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	node.mesh = mesh
	node.position = position
	node.material_override = _material(color)
	root.add_child(node)

static func build(id: String) -> Node3D:
	var root := Node3D.new()
	root.name = id
	match id:
		"botta":
			_sphere(root, 0.36, Vector3(0, 0.41, 0), PEACH)
			_box(root, Vector3(0.31, 0.39, 0.20), Vector3(0, 0.35, -0.34), WOOD)
			_sphere(root, 0.31, Vector3(0, 0.75, 0), PEACH)
			_sphere(root, 0.16, Vector3(-0.21, 1.00, 0), PEACH)
			_sphere(root, 0.16, Vector3(0.21, 1.00, 0), PEACH)
			_box(root, Vector3(0.49, 0.10, 0.43), Vector3(0, 0.99, 0), CREAM)
			_box(root, Vector3(0.43, 0.08, 0.13), Vector3(0, 0.52, 0.28), CREAM)
			for cheek_x in [-0.22, 0.22]:
				_sphere(root, 0.045, Vector3(cheek_x, 0.70, 0.25), Color("e59d8d"))
		"todam":
			_sphere(root, 0.42, Vector3(0, 0.32, -0.07), SAGE)
			_sphere(root, 0.27, Vector3(0, 0.57, 0.23), LEAF)
			_sphere(root, 0.20, Vector3(-0.32, 0.17, 0.14), LEAF)
			_sphere(root, 0.20, Vector3(0.32, 0.17, 0.14), LEAF)
			_box(root, Vector3(0.04, 0.24, 0.04), Vector3(0, 0.94, 0.18), LEAF)
			_sphere(root, 0.12, Vector3(0.10, 1.04, 0.18), SAGE)
			_sphere(root, 0.09, Vector3(-0.18, 0.43, 0.43), PEACH)
			_sphere(root, 0.09, Vector3(0.18, 0.43, 0.43), PEACH)
		"saemi":
			_sphere(root, 0.34, Vector3(0, 0.42, 0), SKY)
			_sphere(root, 0.26, Vector3(0, 0.76, 0), SKY)
			_sphere(root, 0.21, Vector3(-0.31, 0.45, 0), CREAM)
			_sphere(root, 0.21, Vector3(0.31, 0.45, 0), CREAM)
			_box(root, Vector3(0.16, 0.09, 0.24), Vector3(0, 0.67, 0.29), WOOD)
			_sphere(root, 0.14, Vector3(0, 1.04, -0.04), CREAM)
			_box(root, Vector3(0.36, 0.29, 0.10), Vector3(0, 0.35, 0.28), CREAM)
			_sphere(root, 0.08, Vector3(0.34, 0.37, 0.29), PEACH)
	var eye_y := 0.80
	var eye_z := 0.29
	if id == "todam":
		eye_y = 0.66
		eye_z = 0.47
	elif id == "saemi":
		eye_z = 0.24
	for eye_x in [-0.12, 0.12]:
		_sphere(root, 0.035, Vector3(eye_x, eye_y, eye_z), DARK)
	return root

static func dialogue(id: String) -> PackedStringArray:
	match id:
		"botta":
			return PackedStringArray(["오늘 길에서 본 색을 적어둘게.", "이 벤치는 여행 이야기를 듣기 좋아.", "가방 속 마을이 조금씩 넓어져.", "돌길 끝에는 뭐가 있을까?", "책장에 지도를 꽂아두자.", "쉬어 가도 여행은 계속돼.", "새로운 재료를 어디에 쓸까?", "토담에게 화단을 보여주고 싶어.", "새미가 만든 차 향이 좋네.", "내 기록장은 아직 빈 쪽이 많아.", "우리 마을에 손님이 오면 좋겠다.", "다음 목적지는 정원 옆이야."])
		"todam":
			return PackedStringArray(["씨앗은 물을 조금씩 좋아해.", "화단에 새 잎이 올라왔어.", "오늘 흙은 포슬포슬하네.", "작은 돌도 길을 만들 수 있어.", "화분을 볕 쪽으로 돌려볼까?", "정원은 서두르지 않아도 자라.", "새미에게 허브를 가져다줄게.", "벤치 옆에는 꽃이 어울려.", "이 길은 비가 와도 안전해.", "씨앗을 나눌 수 있어서 좋아.", "우물 소리가 들리면 쉬어 가자.", "내일은 어떤 꽃이 필까?"])
		"saemi":
			return PackedStringArray(["따뜻한 차 한 잔 준비할게.", "탁자 옆 자리가 제일 좋아.", "오늘은 향긋한 잎을 골랐어.", "찻집 창문을 열어두자.", "보따의 이야기를 듣고 싶어.", "토담의 허브가 차에 잘 어울려.", "소풍 돗자리를 펴볼까?", "손님이 오면 작은 잔을 꺼낼게.", "비 오는 날엔 따뜻한 차가 좋지.", "책장에 조리법을 꽂아뒀어.", "다음엔 과일차를 만들어볼게.", "우리 마을 저녁은 조용해서 좋아."])
	return PackedStringArray()

static func preferred_recipes(id: String) -> PackedStringArray:
	match id:
		"botta": return PackedStringArray(["bench", "bookshelf", "hammock"])
		"todam": return PackedStringArray(["flowerbed", "planter", "well"])
		"saemi": return PackedStringArray(["table", "tea_house", "picnic_mat"])
	return PackedStringArray(["bench"])
