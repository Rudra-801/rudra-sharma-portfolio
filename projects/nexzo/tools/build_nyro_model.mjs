// Export the authored sculpture as an offline glTF 2.0 binary, without an external exporter.
// Shared meshes / instanced fur use node references. No textures, secrets or borrowed assets.
import fs from 'node:fs';
import * as T from '../Frontend/assets/vendor/three/three.module.js';
import { buildCreature } from '../Frontend/experiments/companion/creature.mjs';
const sculpture=buildCreature(T),chunks=[];
let offset=0;
const gltf={asset:{version:'2.0',generator:'NEXZO original night-fox sculpture'},scene:0,scenes:[{nodes:[0]}],nodes:[],meshes:[],materials:[],accessors:[],bufferViews:[],buffers:[]};
const geometryCache=new Map(),materialCache=new Map(),meshCache=new Map();
function attribute(a,type,target) {
  const bytes=Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength),padded=Buffer.alloc(Math.ceil(bytes.length/4)*4);bytes.copy(padded);chunks.push(padded);
  const view=gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:bytes.length,target})-1;offset+=padded.length;
  const entry={bufferView:view,componentType:a.array instanceof Uint16Array?5123:a.array instanceof Uint32Array?5125:5126,count:a.count,type};
  if(type==='VEC3'){entry.min=[Infinity,Infinity,Infinity];entry.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.count;i++)for(let j=0;j<3;j++){const v=a.array[i*3+j];entry.min[j]=Math.min(entry.min[j],v);entry.max[j]=Math.max(entry.max[j],v);}}
  return gltf.accessors.push(entry)-1;
}
function material(m) {
  if(materialCache.has(m.uuid))return materialCache.get(m.uuid);
  const i=gltf.materials.push({name:m.name||m.type,pbrMetallicRoughness:{baseColorFactor:[...m.color.toArray(),1],metallicFactor:m.metalness||0,roughnessFactor:m.roughness??1},emissiveFactor:m.emissive?m.emissive.clone().multiplyScalar(m.emissiveIntensity).toArray():[0,0,0],doubleSided:m.side===T.DoubleSide})-1;
  materialCache.set(m.uuid,i);return i;
}
function mesh(o) {
  const key=o.geometry.uuid+o.material.uuid;if(meshCache.has(key))return meshCache.get(key);
  let geometry=geometryCache.get(o.geometry.uuid);
  if(!geometry){const g=o.geometry;geometry={attributes:{POSITION:attribute(g.attributes.position,'VEC3',34962),NORMAL:attribute(g.attributes.normal,'VEC3',34962)}};if(g.index)geometry.indices=attribute(g.index,'SCALAR',34963);geometryCache.set(g.uuid,geometry);}
  const i=gltf.meshes.push({primitives:[{...geometry,material:material(o.material)}]})-1;meshCache.set(key,i);return i;
}
function node(o,matrix) {
  o.updateMatrix();const n={name:o.name||o.type,matrix:(matrix||o.matrix).toArray()},i=gltf.nodes.push(n)-1;
  if(o.isMesh)n.mesh=mesh(o);
  const children=o.children.map(c=>node(c));
  if(o.isInstancedMesh){
    const translations=new Float32Array(o.count*3),rotations=new Float32Array(o.count*4),scales=new Float32Array(o.count*3);
    const transform=new T.Matrix4(),p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();
    for(let j=0;j<o.count;j++){o.getMatrixAt(j,transform);transform.decompose(p,q,s);p.toArray(translations,j*3);q.toArray(rotations,j*4);s.toArray(scales,j*3);}
    n.extensions={EXT_mesh_gpu_instancing:{attributes:{TRANSLATION:attribute(new T.BufferAttribute(translations,3),'VEC3'),ROTATION:attribute(new T.BufferAttribute(rotations,4),'VEC4'),SCALE:attribute(new T.BufferAttribute(scales,3),'VEC3')}}};
    gltf.extensionsUsed=['EXT_mesh_gpu_instancing'];gltf.extensionsRequired=['EXT_mesh_gpu_instancing'];
  }
  if(children.length)n.children=children;return i;
}
node(sculpture.root);gltf.buffers.push({byteLength:offset});
const json=Buffer.from(JSON.stringify(gltf)),paddedJSON=Buffer.alloc(Math.ceil(json.length/4)*4,0x20);json.copy(paddedJSON);
const bin=Buffer.concat(chunks),header=Buffer.alloc(12),jsonHeader=Buffer.alloc(8),binHeader=Buffer.alloc(8);
header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+paddedJSON.length+bin.length,8);
jsonHeader.writeUInt32LE(paddedJSON.length);jsonHeader.writeUInt32LE(0x4e4f534a,4);binHeader.writeUInt32LE(bin.length);binHeader.writeUInt32LE(0x004e4942,4);
const output=new URL('../Frontend/experiments/companion/assets/nyro-nightfox.glb',import.meta.url);fs.mkdirSync(new URL('.',output),{recursive:true});fs.writeFileSync(output,Buffer.concat([header,jsonHeader,paddedJSON,binHeader,bin]));
console.log(`Original NYRO GLB: ${gltf.nodes.length} nodes, ${gltf.meshes.length} shared meshes, ${fs.statSync(output).size} bytes`);
