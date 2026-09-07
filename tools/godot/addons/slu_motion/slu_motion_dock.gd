@tool
extends VBoxContainer

const MARKER_KINDS := [
	"impact", "hitbox_on", "hitbox_off", "foot_plant", "vfx", "audio",
	"camera", "gameplay", "pose", "cancel_open", "cancel_close", "custom"
]

var package_path: String = ""
var package_data: Dictionary = {}
var animation_players: Array[AnimationPlayer] = []
var current_player: AnimationPlayer
var current_clip: Dictionary = {}
var current_animation_name: String = ""

var package_label: Label
var player_picker: OptionButton
var clip_picker: OptionButton
var timeline: HSlider
var time_label: Label
var marker_list: ItemList
var marker_id: LineEdit
var marker_kind: OptionButton
var marker_recipe: LineEdit
var status: Label
var file_dialog: EditorFileDialog
var _updating_slider := false

func _ready() -> void:
	name = "SLU Motion"
	custom_minimum_size = Vector2(330, 520)
	_build_ui()
	set_process(true)

func _build_ui() -> void:
	var title := Label.new()
	title.text = "SLU MOTION // GODOT"
	title.add_theme_font_size_override("font_size", 18)
	add_child(title)

	package_label = Label.new()
	package_label.text = "No package loaded"
	package_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(package_label)

	var load_button := Button.new()
	load_button.text = "Load .slu-motion-impact.json"
	load_button.pressed.connect(_choose_package)
	add_child(load_button)

	var scan_button := Button.new()
	scan_button.text = "Scan Edited Scene"
	scan_button.pressed.connect(_scan_scene)
	add_child(scan_button)

	player_picker = OptionButton.new()
	player_picker.item_selected.connect(_select_player)
	add_child(player_picker)

	clip_picker = OptionButton.new()
	clip_picker.item_selected.connect(_select_clip)
	add_child(clip_picker)

	var transport := HBoxContainer.new()
	var replay := Button.new()
	replay.text = "Replay"
	replay.pressed.connect(_replay)
	transport.add_child(replay)
	var stop := Button.new()
	stop.text = "Stop"
	stop.pressed.connect(_stop)
	transport.add_child(stop)
	var install := Button.new()
	install.text = "Install Markers"
	install.pressed.connect(_install_markers)
	transport.add_child(install)
	add_child(transport)

	timeline = HSlider.new()
	timeline.min_value = 0.0
	timeline.max_value = 1.0
	timeline.step = 0.001
	timeline.value_changed.connect(_seek)
	add_child(timeline)

	time_label = Label.new()
	time_label.text = "0.000 / 0.000"
	add_child(time_label)

	var marker_header := Label.new()
	marker_header.text = "Markers"
	add_child(marker_header)

	marker_list = ItemList.new()
	marker_list.custom_minimum_size = Vector2(0, 160)
	add_child(marker_list)

	var add_header := Label.new()
	add_header.text = "Add marker at playhead"
	add_child(add_header)

	marker_id = LineEdit.new()
	marker_id.placeholder_text = "marker id (e.g. impact_01)"
	add_child(marker_id)

	marker_kind = OptionButton.new()
	for kind in MARKER_KINDS:
		marker_kind.add_item(kind)
	add_child(marker_kind)

	marker_recipe = LineEdit.new()
	marker_recipe.placeholder_text = "recipe id (optional)"
	add_child(marker_recipe)

	var author_row := HBoxContainer.new()
	var add_marker := Button.new()
	add_marker.text = "Add"
	add_marker.pressed.connect(_add_marker)
	author_row.add_child(add_marker)
	var save := Button.new()
	save.text = "Save Package"
	save.pressed.connect(_save_package)
	author_row.add_child(save)
	add_child(author_row)

	status = Label.new()
	status.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status.text = "Load a package, scan the scene, then preview or install markers."
	add_child(status)

	file_dialog = EditorFileDialog.new()
	file_dialog.file_mode = EditorFileDialog.FILE_MODE_OPEN_FILE
	file_dialog.access = EditorFileDialog.ACCESS_FILESYSTEM
	file_dialog.filters = PackedStringArray(["*.json ; SLU Motion/Impact Package"])
	file_dialog.file_selected.connect(_load_package)
	add_child(file_dialog)

func _choose_package() -> void:
	file_dialog.popup_centered_ratio(0.7)

func _load_package(path: String) -> void:
	var text := FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		status.text = "ERROR: package is not a JSON object"
		return
	package_data = parsed as Dictionary
	if String(package_data.get("schema", "")) != "slu-motion-impact":
		status.text = "ERROR: unsupported schema"
		return
	package_path = path
	package_label.text = "%s\n%s" % [String(package_data.get("id", "unnamed")), path]
	_refresh_clips()
	status.text = "Package loaded. Scan the edited scene."

func _scan_scene() -> void:
	animation_players.clear()
	player_picker.clear()
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		status.text = "No edited scene root."
		return
	_collect_animation_players(root)
	for player in animation_players:
		player_picker.add_item(String(player.get_path()))
	if animation_players.is_empty():
		status.text = "No AnimationPlayer found in edited scene."
		current_player = null
		return
	_select_player(0)
	status.text = "Found %d AnimationPlayer(s)." % animation_players.size()

func _collect_animation_players(node: Node) -> void:
	if node is AnimationPlayer:
		animation_players.append(node as AnimationPlayer)
	for child in node.get_children():
		_collect_animation_players(child)

func _select_player(index: int) -> void:
	if index < 0 or index >= animation_players.size():
		return
	current_player = animation_players[index]
	_match_clip_to_player()

func _refresh_clips() -> void:
	clip_picker.clear()
	var clips: Array = package_data.get("clips", []) as Array
	for clip_value in clips:
		var clip := clip_value as Dictionary
		clip_picker.add_item(String(clip.get("id", "unnamed")))
	if not clips.is_empty():
		_select_clip(0)

func _select_clip(index: int) -> void:
	var clips: Array = package_data.get("clips", []) as Array
	if index < 0 or index >= clips.size():
		current_clip = {}
		return
	current_clip = clips[index] as Dictionary
	_match_clip_to_player()
	_refresh_marker_list()

func _match_clip_to_player() -> void:
	current_animation_name = ""
	if current_clip.is_empty():
		return
	var metadata: Dictionary = current_clip.get("metadata", {}) as Dictionary
	var preferred := String(metadata.get("animationName", current_clip.get("id", "")))
	if current_player != null and current_player.has_animation(preferred):
		current_animation_name = preferred
	else:
		current_animation_name = preferred
	var duration := float(current_clip.get("duration", 1.0))
	if current_player != null and current_player.has_animation(current_animation_name):
		var anim := current_player.get_animation(current_animation_name)
		if anim != null:
			duration = anim.length
	timeline.max_value = maxf(duration, 0.001)
	timeline.value = 0.0
	_update_time_label()

func _replay() -> void:
	if current_player == null or current_animation_name.is_empty():
		status.text = "Select a scene AnimationPlayer and package clip first."
		return
	if not current_player.has_animation(current_animation_name):
		status.text = "Animation '%s' not found on selected player." % current_animation_name
		return
	current_player.stop()
	current_player.play(current_animation_name)
	current_player.seek(0.0, true)
	status.text = "Playing %s" % current_animation_name

func _stop() -> void:
	if current_player != null:
		current_player.stop()

func _seek(value: float) -> void:
	if _updating_slider or current_player == null or current_animation_name.is_empty():
		return
	if not current_player.has_animation(current_animation_name):
		return
	current_player.play(current_animation_name)
	current_player.seek(value, true)
	current_player.pause()
	_update_time_label()

func _process(_delta: float) -> void:
	if current_player == null or current_animation_name.is_empty():
		return
	if current_player.current_animation == current_animation_name and current_player.is_playing():
		_updating_slider = true
		timeline.value = current_player.current_animation_position
		_updating_slider = false
		_update_time_label()

func _update_time_label() -> void:
	time_label.text = "%.3f / %.3f" % [timeline.value, timeline.max_value]

func _refresh_marker_list() -> void:
	marker_list.clear()
	var markers: Array = current_clip.get("markers", []) as Array
	for marker_value in markers:
		var marker := marker_value as Dictionary
		marker_list.add_item("%.3f  %-12s  %s" % [float(marker.get("at", 0.0)), String(marker.get("kind", "custom")), String(marker.get("id", ""))])

func _add_marker() -> void:
	if current_clip.is_empty():
		status.text = "Select a package clip first."
		return
	var id := marker_id.text.strip_edges()
	if id.is_empty():
		id = "marker_%03d" % int(round(timeline.value * 1000.0))
	var marker := {
		"id": id,
		"at": snappedf(float(timeline.value), 0.001),
		"kind": marker_kind.get_item_text(marker_kind.selected)
	}
	var recipe := marker_recipe.text.strip_edges()
	if not recipe.is_empty():
		marker["recipeId"] = recipe
	var markers: Array = current_clip.get("markers", []) as Array
	markers.append(marker)
	markers.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a.get("at", 0.0)) < float(b.get("at", 0.0)))
	current_clip["markers"] = markers
	_refresh_marker_list()
	marker_id.clear()
	status.text = "Added marker at %.3fs (in memory)." % timeline.value

func _save_package() -> void:
	if package_path.is_empty() or package_data.is_empty():
		status.text = "No package loaded."
		return
	var file := FileAccess.open(package_path, FileAccess.WRITE)
	if file == null:
		status.text = "ERROR: could not open package for writing."
		return
	file.store_string(JSON.stringify(package_data, "  "))
	file.close()
	status.text = "Saved package."

func _install_markers() -> void:
	if current_player == null or current_clip.is_empty():
		status.text = "Select a player and package clip first."
		return
	if not current_player.has_animation(current_animation_name):
		status.text = "Animation '%s' not found." % current_animation_name
		return
	var animation := current_player.get_animation(current_animation_name)
	if animation == null:
		status.text = "Animation resource unavailable."
		return
	# Remove prior SLU-generated method tracks so installation is idempotent.
	for track_index in range(animation.get_track_count() - 1, -1, -1):
		if animation.track_get_type(track_index) == Animation.TYPE_METHOD and String(animation.track_get_path(track_index)) == ".":
			animation.remove_track(track_index)
	var track := animation.add_track(Animation.TYPE_METHOD)
	animation.track_set_path(track, NodePath("."))
	var installed := 0
	var markers: Array = current_clip.get("markers", []) as Array
	for marker_value in markers:
		var marker := marker_value as Dictionary
		var key := {
			"method": "_slu_motion_marker",
			"args": [
				String(marker.get("id", "")),
				String(marker.get("kind", "custom")),
				String(marker.get("recipeId", "")),
				marker.get("payload", {})
			]
		}
		animation.track_insert_key(track, float(marker.get("at", 0.0)), key)
		installed += 1
	ResourceSaver.save(animation)
	status.text = "Installed %d markers into %s." % [installed, current_animation_name]
