// Authored skeletal interaction poses; no scores or progress are generated here.
export function interactionPose(c,state,t,duration){
 const phase=t/duration, envelope=Math.sin(Math.PI*Math.min(1,phase))**.5;
 if(state==='EAT'){
  c.root.position.y=0;c.root.rotation.z=0;
  c.head.position.y=.52-.25*envelope;c.head.position.z=.03+.18*envelope;
  c.head.rotation.x=(.48+.055*Math.sin(t*10))*envelope;
  c.eyes.forEach(e=>e.scale.y=1-.22*envelope);
  c.paws.forEach((p,i)=>{p.rotation.x=-.15*envelope;p.rotation.z=(i?1:-1)*.06*envelope});
  c.tail.rotation.z=Math.sin(t*2)*.05;
 }
 if(state==='PLAY'){
  c.root.position.y=Math.abs(Math.sin(t*4))*.045*envelope;c.root.rotation.z=Math.sin(t*4)*.035*envelope;
  c.head.rotation.y=Math.sin(t*4)*.22*envelope;c.head.rotation.x=.12*envelope;
  c.paws.forEach((p,i)=>{const reach=Math.max(0,Math.sin(t*4+i*Math.PI));p.rotation.x=-.6*reach*envelope;p.position.y=-.64+.1*reach*envelope});
  c.tail.rotation.z=Math.sin(t*6)*.25*envelope;
 }
 if(state==='SLEEP'||state==='WAKE'){
  const f=state==='WAKE'?1-Math.min(1,phase):1;
  c.root.position.y=-.03*f;c.body.scale.y=1-.14*f;
  c.head.position.y=.52-.25*f;c.head.rotation.x=.25*f;c.head.rotation.z=.10*f;
  c.eyes.forEach(e=>e.scale.y=1-.94*f);
  c.paws.forEach(p=>p.rotation.x=-.25*f);
  c.tail.rotation.y=.48*f;c.tail.rotation.z=.12*f;
 }
}
