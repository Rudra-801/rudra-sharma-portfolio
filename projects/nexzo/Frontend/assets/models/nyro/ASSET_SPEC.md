# NYRO production asset contract

Status: REQUIRED, NOT SUPPLIED. Do not rename either procedural review GLB to nyro.glb.
Install the artist-approved binary at Frontend/assets/models/nyro/nyro.glb.
The local runtime automatically loads and structurally validates it on reopening Pet Zone.
Structural validation is not proof of visual quality. Artist and browser acceptance remain mandatory.

Original compact fantasy cat/fox: obsidian fur-like body, detailed paws, expressive violet eyes,
crystalline forehead/chest/ears and broad articulated tail. Restrained cyan/violet emission.
Reference images are art direction, not meshes, texture maps or animation data.

GLB 2.0, embedded buffers and 1K/2K textures; no external dependencies.
15k-50k triangles; clean deformation loops around eyes, mouth, shoulders, hips, tail.
UV0 required on meshes. PBR base color, normal, roughness/metalness, AO and emissive maps.
Use sRGB for color/emissive, linear data maps. Avoid baked lighting and excessive transparency.
Uncompressed GLB initially; Draco/Meshopt require separately configured local decoders.
Target <=10 MB, <=20 materials/draw calls, no cameras/lights from DCC.
Y-up, forward +Z, meters, ground origin, applied object transforms. Height ~1m.
Runtime centers and scales to fit its controlled viewport.

Rig: Root, Pelvis, Spine, Chest, Neck, Head, optional Jaw; Eye_L, Eye_R;
upper/lower eyelids, Ear_L/R, FrontLeg_L/R, FrontPaw_L/R,
HindLeg_L/R, HindPaw_L/R, articulated tail chain and optional crystal bones.
Meshes must be genuinely skinned with normalized weights. No disconnected rigid primitive assembly.
Eye/head local X pitch, Y yaw; neutral pose looks +Z. Head tracking is limited and smoothed.
Facial capabilities: blink, gaze, happy, sad, curious, sleepy.

Required named clips (config.mjs maps names):
Idle, Idle_02, Blink, EarTwitch, LookAround, Curious, Thinking, Working,
Happy, Celebrate, Play, Eat, Sleep, Wake, Sad.
Idle includes breathing, tail and weight shift; Sleep includes subtle breathing.
Blink/EarTwitch/LookAround must key only their respective facial/ear/head tracks,
not full-body idle tracks. Export clean neutral boundaries for compositing.
One-shots end in a blendable neutral posture. Looping clips must be seamless.
Eat and Play should include their own authored props and synchronized prop visibility/scale,
with no props visible outside those clips. Wake opens eyes and rises naturally.
No root-motion displacement out of viewport.

Acceptance after delivery: inspect geometry, skins, bones, UVs, PBR textures and all clips;
review 360-degree silhouette/materials; test each transition, eye axes and deformation;
real Assistant streaming, verified Planner/quiz receipts, Feed/Play/Rest and reload;
1920x1080,1440x900,1366x768,390px; reduced motion, offline, WebGL failure,
hidden/offscreen pause, renderer disposal. This cannot be signed off without the asset.
