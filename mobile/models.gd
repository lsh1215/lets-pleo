extends RefCounted

# Original procedural low-poly models. Each catalog ID has its own silhouette.
const WOOD := Color("b98158")
const DARK_WOOD := Color("805f48")
const CREAM := Color("f4e5c9")
const SAGE := Color("8bb58a")
const LEAF := Color("5f986f")
const STONE := Color("a8aca6")
const FABRIC := Color("efb99e")
const GOLD := Color("f5d283")
const WATER := Color("90c5d0")

static func _material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 1.0
	return material

static func _box(root: Node3D, size: Vector3, at: Vector3, color: Color) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	node.mesh = mesh
	node.material_override = _material(color)
	node.position = at
	root.add_child(node)
	return node

static func _ball(root: Node3D, radius: float, at: Vector3, color: Color) -> void:
	var node := MeshInstance3D.new()
	var mesh := SphereMesh.new()
	mesh.radial_segments = 16
	mesh.rings = 8
	mesh.radius = radius
	mesh.height = radius * 2.0
	node.mesh = mesh
	node.material_override = _material(color)
	node.position = at
	root.add_child(node)

static func _cylinder(root: Node3D, radius: float, height: float, at: Vector3, color: Color, top_radius: float = -1.0) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.radial_segments = 12
	mesh.bottom_radius = radius
	mesh.top_radius = radius if top_radius < 0.0 else top_radius
	mesh.height = height
	node.mesh = mesh
	node.material_override = _material(color)
	node.position = at
	root.add_child(node)
	return node

static func _roof(root: Node3D, depth: float, color: Color) -> void:
	var left := _box(root, Vector3(1.17, 0.13, depth), Vector3(-0.48, 1.30, 0), color)
	left.rotation_degrees.z = 25
	var right := _box(root, Vector3(1.17, 0.13, depth), Vector3(0.48, 1.30, 0), color)
	right.rotation_degrees.z = -25
	_box(root, Vector3(0.15, 0.08, depth + 0.05), Vector3(0, 1.54, 0), CREAM)

static func _window(root: Node3D, x: float, y: float, z: float) -> void:
	_box(root, Vector3(0.30, 0.31, 0.065), Vector3(x, y, z), WOOD)
	_box(root, Vector3(0.22, 0.23, 0.07), Vector3(x, y, z + 0.01), WATER)
	_box(root, Vector3(0.035, 0.23, 0.08), Vector3(x, y, z + 0.02), CREAM)

static func build(recipe: String) -> Node3D:
	var root := Node3D.new()
	match recipe:
		"bench":
			_box(root, Vector3(0.78, 0.09, 0.32), Vector3(0, 0.38, 0), WOOD)
			_box(root, Vector3(0.78, 0.32, 0.07), Vector3(0, 0.58, -0.15), DARK_WOOD)
			for x in [-0.31, 0.31]:
				_box(root, Vector3(0.08, 0.35, 0.08), Vector3(x, 0.18, -0.10), DARK_WOOD)
				_box(root, Vector3(0.08, 0.35, 0.08), Vector3(x, 0.18, 0.10), DARK_WOOD)
		"flowerbed":
			_box(root, Vector3(0.82, 0.19, 0.72), Vector3(0, 0.12, 0), DARK_WOOD)
			_box(root, Vector3(0.68, 0.03, 0.58), Vector3(0, 0.23, 0), SAGE)
			for x in [-0.23, 0.0, 0.23]:
				_box(root, Vector3(0.025, 0.22, 0.025), Vector3(x, 0.36, 0), LEAF)
				_ball(root, 0.11, Vector3(x, 0.48, 0), FABRIC if x < 0.0 else GOLD)
		"lamp":
			_cylinder(root, 0.18, 0.08, Vector3(0, 0.04, 0), STONE)
			_cylinder(root, 0.04, 0.69, Vector3(0, 0.42, 0), DARK_WOOD)
			_cylinder(root, 0.21, 0.33, Vector3(0, 0.86, 0), GOLD, 0.11)
		"table":
			_box(root, Vector3(0.82, 0.09, 0.72), Vector3(0, 0.53, 0), WOOD)
			for x in [-0.30, 0.30]:
				for z in [-0.24, 0.24]:
					_box(root, Vector3(0.07, 0.51, 0.07), Vector3(x, 0.25, z), DARK_WOOD)
		"stool":
			_cylinder(root, 0.27, 0.08, Vector3(0, 0.41, 0), WOOD)
			for x in [-0.16, 0.16]:
				_box(root, Vector3(0.07, 0.38, 0.07), Vector3(x, 0.19, 0), DARK_WOOD)
		"rug":
			_box(root, Vector3(0.86, 0.035, 0.72), Vector3(0, 0.025, 0), FABRIC)
			for z in [-0.19, 0.0, 0.19]:
				_box(root, Vector3(0.74, 0.008, 0.04), Vector3(0, 0.048, z), CREAM)
		"bookshelf":
			_box(root, Vector3(0.67, 0.79, 0.13), Vector3(0, 0.40, -0.26), DARK_WOOD)
			for y in [0.13, 0.40, 0.67]:
				_box(root, Vector3(0.71, 0.05, 0.46), Vector3(0, y, -0.02), WOOD)
			for x in [-0.24, -0.06, 0.12, 0.26]:
				_box(root, Vector3(0.10, 0.19, 0.20), Vector3(x, 0.25, -0.04), SAGE if x < 0.0 else FABRIC)
		"planter":
			_cylinder(root, 0.27, 0.34, Vector3(0, 0.18, 0), WOOD, 0.34)
			_cylinder(root, 0.035, 0.32, Vector3(0, 0.49, 0), LEAF)
			for x in [-0.16, 0.16]:
				_ball(root, 0.16, Vector3(x, 0.65, 0), SAGE)
		"well":
			_cylinder(root, 0.39, 0.39, Vector3(0, 0.20, 0), STONE)
			_cylinder(root, 0.30, 0.035, Vector3(0, 0.41, 0), WATER)
			for x in [-0.31, 0.31]:
				_box(root, Vector3(0.06, 0.48, 0.06), Vector3(x, 0.62, 0), DARK_WOOD)
			_box(root, Vector3(0.81, 0.07, 0.55), Vector3(0, 0.86, 0), WOOD)
		"mailbox":
			_box(root, Vector3(0.08, 0.63, 0.08), Vector3(0, 0.31, 0), DARK_WOOD)
			_box(root, Vector3(0.43, 0.30, 0.37), Vector3(0, 0.72, 0), FABRIC)
			_box(root, Vector3(0.33, 0.03, 0.03), Vector3(0, 0.72, 0.20), CREAM)
		"signpost":
			_box(root, Vector3(0.09, 0.79, 0.09), Vector3(0, 0.40, 0), DARK_WOOD)
			_box(root, Vector3(0.67, 0.20, 0.08), Vector3(0.16, 0.67, 0), CREAM)
			_box(root, Vector3(0.41, 0.17, 0.08), Vector3(-0.17, 0.42, 0), WOOD)
		"lantern":
			_cylinder(root, 0.07, 0.09, Vector3(0, 0.04, 0), DARK_WOOD)
			_cylinder(root, 0.23, 0.49, Vector3(0, 0.36, 0), FABRIC, 0.17)
			_box(root, Vector3(0.36, 0.04, 0.36), Vector3(0, 0.62, 0), DARK_WOOD)
			_box(root, Vector3(0.06, 0.17, 0.06), Vector3(0, 0.71, 0), WOOD)
		"fountain":
			_cylinder(root, 0.44, 0.18, Vector3(0, 0.10, 0), STONE)
			_cylinder(root, 0.34, 0.025, Vector3(0, 0.21, 0), WATER)
			_cylinder(root, 0.07, 0.43, Vector3(0, 0.44, 0), STONE)
			_ball(root, 0.13, Vector3(0, 0.70, 0), WATER)
		"picnic_mat":
			_box(root, Vector3(0.90, 0.025, 0.82), Vector3(0, 0.02, 0), FABRIC)
			_box(root, Vector3(0.85, 0.008, 0.09), Vector3(0, 0.037, 0), CREAM)
			_box(root, Vector3(0.22, 0.18, 0.20), Vector3(0.22, 0.10, -0.18), WOOD)
		"swing":
			for x in [-0.36, 0.36]:
				_box(root, Vector3(0.07, 0.87, 0.07), Vector3(x, 0.44, 0), WOOD)
			_box(root, Vector3(0.86, 0.07, 0.08), Vector3(0, 0.86, 0), DARK_WOOD)
			for x in [-0.24, 0.24]:
				_box(root, Vector3(0.025, 0.53, 0.025), Vector3(x, 0.57, 0.05), FABRIC)
			_box(root, Vector3(0.56, 0.06, 0.28), Vector3(0, 0.31, 0.05), WOOD)
		"hammock":
			for x in [-0.40, 0.40]:
				_box(root, Vector3(0.09, 0.68, 0.09), Vector3(x, 0.34, 0), DARK_WOOD)
			_box(root, Vector3(0.78, 0.04, 0.48), Vector3(0, 0.35, 0), FABRIC)
			_box(root, Vector3(0.22, 0.06, 0.25), Vector3(-0.21, 0.41, 0), CREAM)
		"cart":
			_box(root, Vector3(0.60, 0.26, 0.49), Vector3(0, 0.41, 0), WOOD)
			for x in [-0.25, 0.25]:
				_cylinder(root, 0.14, 0.06, Vector3(x, 0.15, 0.27), DARK_WOOD).rotation_degrees.x = 90
			_box(root, Vector3(0.08, 0.47, 0.09), Vector3(0.35, 0.47, 0), DARK_WOOD)
		"bike_rack":
			_box(root, Vector3(0.76, 0.06, 0.32), Vector3(0, 0.04, 0), STONE)
			for x in [-0.24, 0.0, 0.24]:
				_box(root, Vector3(0.05, 0.54, 0.05), Vector3(x, 0.32, -0.10), DARK_WOOD)
				_box(root, Vector3(0.05, 0.54, 0.05), Vector3(x, 0.32, 0.10), DARK_WOOD)
		"telescope":
			for x in [-0.22, 0.22]:
				_box(root, Vector3(0.05, 0.54, 0.05), Vector3(x, 0.28, 0), DARK_WOOD)
			_box(root, Vector3(0.05, 0.54, 0.05), Vector3(0, 0.28, -0.19), DARK_WOOD)
			_cylinder(root, 0.14, 0.65, Vector3(0, 0.70, 0), STONE).rotation_degrees.z = 63
			_ball(root, 0.12, Vector3(0.25, 0.81, 0), GOLD)
		"birdhouse":
			_box(root, Vector3(0.07, 0.61, 0.07), Vector3(0, 0.31, 0), DARK_WOOD)
			_box(root, Vector3(0.39, 0.30, 0.36), Vector3(0, 0.75, 0), WOOD)
			_box(root, Vector3(0.50, 0.08, 0.46), Vector3(0, 0.94, 0), FABRIC)
			_ball(root, 0.06, Vector3(0, 0.75, 0.20), DARK_WOOD)
		"windmill":
			_cylinder(root, 0.25, 0.76, Vector3(0, 0.39, 0), CREAM, 0.13)
			_ball(root, 0.09, Vector3(0, 0.77, 0.21), DARK_WOOD)
			for turn in [0.0, 90.0, 180.0, 270.0]:
				var blade := _box(root, Vector3(0.13, 0.33, 0.035), Vector3(0, 1.00, 0.23), FABRIC)
				blade.rotation_degrees.z = turn
		"fence":
			for x in [-0.34, 0.34]:
				_box(root, Vector3(0.09, 0.61, 0.09), Vector3(x, 0.31, 0), DARK_WOOD)
			for y in [0.22, 0.48]:
				_box(root, Vector3(0.79, 0.07, 0.07), Vector3(0, y, 0), WOOD)
		"bridge":
			_box(root, Vector3(0.90, 0.11, 0.72), Vector3(0, 0.18, 0), WOOD)
			for x in [-0.39, 0.39]:
				_box(root, Vector3(0.06, 0.37, 0.72), Vector3(x, 0.34, 0), DARK_WOOD)
		"flower_arch":
			for x in [-0.37, 0.37]:
				_box(root, Vector3(0.08, 0.92, 0.08), Vector3(x, 0.46, 0), WOOD)
			_box(root, Vector3(0.82, 0.08, 0.08), Vector3(0, 0.93, 0), WOOD)
			for x in [-0.28, 0.0, 0.28]:
				_ball(root, 0.11, Vector3(x, 1.04, 0), FABRIC if x < 0.0 else SAGE)
		"workshop":
			_box(root, Vector3(1.67, 1.03, 1.55), Vector3(0, 0.52, 0), CREAM)
			_roof(root, 1.82, WOOD)
			_box(root, Vector3(0.40, 0.71, 0.06), Vector3(0, 0.36, 0.81), DARK_WOOD)
			_window(root, -0.53, 0.66, 0.81)
			_box(root, Vector3(0.54, 0.16, 0.10), Vector3(0, 1.04, 0.87), FABRIC)
			_cylinder(root, 0.11, 0.46, Vector3(0.53, 1.52, -0.37), STONE)
		"cottage":
			_box(root, Vector3(1.56, 0.98, 1.55), Vector3(0, 0.49, 0), CREAM)
			_roof(root, 1.86, FABRIC)
			_box(root, Vector3(0.38, 0.68, 0.06), Vector3(0, 0.34, 0.81), WOOD)
			for x in [-0.51, 0.51]:
				_window(root, x, 0.65, 0.81)
				_box(root, Vector3(0.33, 0.07, 0.16), Vector3(x, 0.43, 0.86), SAGE)
			_ball(root, 0.08, Vector3(-0.55, 0.48, 0.94), FABRIC)
			_ball(root, 0.08, Vector3(0.55, 0.48, 0.94), GOLD)
		"tea_house":
			_box(root, Vector3(1.72, 0.95, 1.67), Vector3(0, 0.48, 0), CREAM)
			_roof(root, 1.98, SAGE)
			_box(root, Vector3(0.58, 0.68, 0.06), Vector3(0, 0.34, 0.87), DARK_WOOD)
			_window(root, -0.58, 0.60, 0.87)
			_window(root, 0.58, 0.60, 0.87)
			_box(root, Vector3(1.32, 0.12, 0.55), Vector3(0, 0.97, 1.08), FABRIC)
			for x in [-0.62, 0.62]:
				_cylinder(root, 0.09, 0.56, Vector3(x, 0.29, 1.02), WOOD)
			_cylinder(root, 0.13, 0.12, Vector3(0, 0.76, 1.40), GOLD)
		_:
			_box(root, Vector3(0.42, 0.50, 0.42), Vector3(0, 0.25, 0), STONE)
	return root
