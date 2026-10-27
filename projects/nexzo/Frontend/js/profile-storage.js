/* NEXZO profile photo storage: compressed, UID-scoped Firebase Storage upload. */
(function(){
  'use strict';
  if(window.NEXZOProfileStorage)return;
  async function compress(file){
    if(!file||!/^image\/(png|jpeg|webp)$/i.test(file.type))throw new Error('Choose a PNG, JPG or WEBP image.');
    if(file.size>8*1024*1024)throw new Error('Profile photo must be smaller than 8 MB.');
    let source=null,revoke='';
    if(typeof createImageBitmap==='function') source=await createImageBitmap(file);
    else {
      const url=URL.createObjectURL(file);revoke=url;
      source=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Could not read this image.'));image.src=url;});
    }
    const width=Number(source.width||source.naturalWidth)||1,height=Number(source.height||source.naturalHeight)||1;
    const max=512,scale=Math.min(1,max/Math.max(width,height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Image canvas is unavailable.');ctx.drawImage(source,0,0,canvas.width,canvas.height);source.close?.();if(revoke)URL.revokeObjectURL(revoke);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Image compression failed.')),'image/webp',0.82));
    return blob;
  }
  async function context(){
    const context=await window.NEXZOFirebase.getContext({auth:true,storage:true});
    return {auth:context.auth,storage:context.storage,tools:context.storageTools};
  }
  async function uploadAt(file,path){
    const blob=await compress(file);
    const {auth,storage,tools}=await context();
    const user=auth.currentUser;if(!user)throw new Error('Sign in before uploading a profile photo.');
    const target=tools.ref(storage,`users/${user.uid}/${path}`);
    await tools.uploadBytes(target,blob,{contentType:'image/webp',cacheControl:'private,max-age=86400'});
    return tools.getDownloadURL(target);
  }
  const upload=file=>uploadAt(file,'profile/avatar.webp');
  const uploadAssistant=file=>uploadAt(file,'assistant/avatar.webp');
  window.NEXZOProfileStorage=Object.freeze({upload,uploadAssistant,compress});
})();
