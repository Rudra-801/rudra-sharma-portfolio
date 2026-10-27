(function(root){
  'use strict';
  function tags(input){
    const values=[...new Set(String(input||'').split(',').map(v=>v.trim().replace(/^#+/,'').trim().toLowerCase()).filter(Boolean))];
    if(values.length>4)throw Error('Use a maximum of four tags.');
    if(values.some(v=>v.length>24))throw Error('Each tag must be 24 characters or fewer.');
    return values;
  }
  function logo(file){
    if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPG or WebP image.');
    if(file.size>2*1024*1024)throw Error('Group logo must be 2 MB or smaller.');
    return true;
  }
  root.NEXZOCommunityContracts=Object.freeze({tags,logo});
})(globalThis);
