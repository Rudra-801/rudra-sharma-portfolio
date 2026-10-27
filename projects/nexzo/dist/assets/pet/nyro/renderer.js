import * as THREE from '../../vendor/three/three.module.js';
import {GLTFLoader} from '../../vendor/three/GLTFLoader.js';
const mapping={BOOT:'Wake',IDLE:'Idle',CURIOUS:'Curious',LOOKING:'Look',BLINK:'Blink',THINKING:'Thinking',WORKING:'Working',STUDYING:'Study',HAPPY:'Happy',EXCITED:'Happy',CELEBRATE:'Celebrate',PLAY:'Play',EAT:'Eat',SLEEPY:'Sleepy',SLEEPING:'Sleep',WAKE:'Wake',SAD:'Curious',LOW_ENERGY:'LowEnergy'};
export async function createRenderer(host,brain,reduced){
 const mobile=innerWidth<768;
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:!mobile,powerPreference:'low-power'});
 renderer.setClearColor(0,0);renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.25:1.75));
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.04;
 if('outputColorSpace' in renderer)renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.domElement.id='nexzoPetCanvas';renderer.domElement.dataset.renderer='THREE.WebGLRenderer';renderer.domElement.setAttribute('aria-label','Nyro real 3D companion');host.append(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(32,1,.1,30);
 camera.position.set(1.15,1.9,5.2);camera.lookAt(0,1,0);
 scene.add(new THREE.HemisphereLight(0xcbd7ff,0x17112d,2.35));
 for(const [color,power,position] of [[0xf7f2ff,4.15,[3,4,4]],[0x4ed7f2,1.45,[-3,2,2]],[0x8759df,1.75,[1,3,-3]]]){const l=new THREE.DirectionalLight(color,power);l.position.set(...position);scene.add(l);}
 // Keep the model URL versioned so a promoted body cannot be hidden behind a
 // stale service-worker/browser cache after a release build.
 const modelUrl=new URL('./nyro.glb',import.meta.url);modelUrl.search='v=nyro-crystalline-v1';
 let gltf;try{gltf=await new GLTFLoader().loadAsync(modelUrl.href);}catch(error){renderer.dispose();renderer.domElement.remove();throw error;}
 scene.add(gltf.scene);
 // The asset was authored with a generous review-stage framing. Keep the
 // transparent companion compact, but bring the body forward enough that its
 // real head/limb motion remains readable at the floating 150px canvas size.
 gltf.scene.scale.set(1,1,1);
 // The GLB keeps its authored PBR structure; this restrained runtime grade
 // lifts the graphite body enough to read as friendly on dark NEXZO pages
 // without turning the companion into a neon toy.
 const grade={
  'Graphite':{color:0x211e38,roughness:.41,metalness:.43,clearcoat:.18,clearcoatRoughness:.3},
  'Violet polymer':{color:0x42256f,roughness:.31,metalness:.46,clearcoat:.24,clearcoatRoughness:.27,emissive:0x12002b,emissiveIntensity:.42},
  'Obsidian visor':{color:0x0b1224,roughness:.18,metalness:.68,clearcoat:.42,clearcoatRoughness:.2},
  'Cyan core':{color:0x28d9e4,roughness:.26,metalness:.24,clearcoat:.18,emissive:0x0bbdce,emissiveIntensity:.62},
  'Violet crystal':{color:0x6534bd,roughness:.23,metalness:.36,clearcoat:.28,clearcoatRoughness:.2,emissive:0x4916ad,emissiveIntensity:.48},
  'Violet iris':{color:0x43208f,roughness:.24,metalness:.14,clearcoat:.34,clearcoatRoughness:.16,emissive:0x6334d1,emissiveIntensity:.46},
  'Crystal edge':{color:0x8058ca,roughness:.21,metalness:.45,clearcoat:.3,clearcoatRoughness:.19,emissive:0x5a2bb2,emissiveIntensity:.36}
 };
 gltf.scene.traverse(o=>{for(const material of [].concat(o.material||[])){const tune=grade[material.name];if(!tune)continue;if(tune.color!=null)material.color?.set(tune.color);if(tune.roughness!=null)material.roughness=tune.roughness;if(tune.metalness!=null)material.metalness=tune.metalness;if(tune.emissive!=null)material.emissive?.set(tune.emissive);if(tune.emissiveIntensity!=null)material.emissiveIntensity=tune.emissiveIntensity;if(tune.clearcoat!=null&&'clearcoat' in material)material.clearcoat=tune.clearcoat;if(tune.clearcoatRoughness!=null&&'clearcoatRoughness' in material)material.clearcoatRoughness=tune.clearcoatRoughness;}});
 const mixer=new THREE.AnimationMixer(gltf.scene),actions=new Map(gltf.animations.map(c=>[c.name,mixer.clipAction(c)]));
 const head=gltf.scene.getObjectByName('Head'),eyes=['Eye_L','Eye_R'].map(n=>gltf.scene.getObjectByName(n));
 const evidence={renderer:renderer.constructor.name,scene:scene.type,meshes:0,skinnedMeshes:0,bones:0,triangles:0,textures:0,clips:gltf.animations.map(c=>c.name),webgl:renderer.getContext().getParameter(renderer.getContext().VERSION)};
 const bones=new Set();gltf.scene.traverse(o=>{if(o.isMesh){evidence.meshes++;evidence.triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}if(o.isSkinnedMesh){evidence.skinnedMeshes++;o.skeleton.bones.forEach(b=>bones.add(b));}});evidence.bones=bones.size;
 let raf=0,running=false,last=0,state='',active=null,yaw=0,pitch=0,frames=0,totalMs=0;
 const resize=()=>{const box=renderer.domElement.parentElement.getBoundingClientRect();renderer.setSize(Math.max(96,box.width),Math.max(128,box.height),false);camera.aspect=Math.max(96,box.width)/Math.max(128,box.height);camera.updateProjectionMatrix();};
 const observer=new ResizeObserver(resize);observer.observe(host);resize();
 function frame(t){raf=0;if(!running||document.hidden)return;const dt=Math.min(.05,(t-last)/1000||0);last=t;
  if(state!==brain.state){state=brain.state;const next=actions.get(mapping[state]||'Idle');if(next!==active){next?.reset().fadeIn(.3).play();active?.fadeOut(.3);active=next;}}
  const start=performance.now();if(head)head.rotation.set(0,0,0);mixer.update(reduced()?0:dt);
  const pointer=!mobile&&brain.pointer.near?brain.pointer:{x:0,y:0};yaw=THREE.MathUtils.damp(yaw,pointer.x*.23,5,dt);pitch=THREE.MathUtils.damp(pitch,pointer.y*.13,5,dt);
  if(head){head.rotation.y=yaw;head.rotation.x+=pitch;}eyes.forEach(e=>{if(e){e.rotation.y=yaw*1.3;e.scale.y=(state==='BLINK'||state==='SLEEPING')?.12:1;}});
  renderer.render(scene,camera);frames++;totalMs+=performance.now()-start;
  if(frames===180&&totalMs/frames>14)renderer.setPixelRatio(1);
  raf=requestAnimationFrame(frame);
 }
 return {evidence,relocate(target){observer.disconnect();target.append(renderer.domElement);observer.observe(target);resize();},canvas:renderer.domElement,get running(){return running;},metrics:()=>({frames,meanRenderMs:frames?totalMs/frames:0}),start(){if(running)return;running=true;last=performance.now();raf=requestAnimationFrame(frame);},stop(){running=false;cancelAnimationFrame(raf);raf=0;},dispose(){this.stop();observer.disconnect();mixer.stopAllAction();mixer.uncacheRoot(gltf.scene);gltf.scene.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of [].concat(o.material))m.dispose();}});renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();},view(angle){camera.position.set(Math.sin(angle)*5,1.9,Math.cos(angle)*5);camera.lookAt(0,1,0);}};
}
