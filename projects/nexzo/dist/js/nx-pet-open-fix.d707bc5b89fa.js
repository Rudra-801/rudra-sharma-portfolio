(()=>{
  const pet=document.querySelector('#nexzoCompanion');
  const modal=document.querySelector('#petZoneModal');
  if(!pet)return;
  // The old six-pet chooser is retired. Keep the living companion as the only Pet Zone surface.
  const retireModal=()=>{
    if(!modal)return;
    modal.hidden=true;
    modal.setAttribute('aria-hidden','true');
    modal.style.setProperty('display','none','important');
    document.body.classList.remove('pet-zone-open');
  };
  const showCompanion=()=>{
    retireModal();
    pet.hidden=false; pet.removeAttribute('hidden'); pet.removeAttribute('aria-hidden');
    pet.style.removeProperty('display');
    pet.dataset.layout='living';
    pet.querySelector('.pet-stage')?.focus?.({preventScroll:true});
  };
  retireModal();
  ['railPetZone','petCustomize','companionViewAll','petRosterViewAll'].forEach(id=>
    document.getElementById(id)?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();showCompanion();},true)
  );
  document.getElementById('petZoneClose')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();retireModal();},true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')retireModal();},true);
})();
