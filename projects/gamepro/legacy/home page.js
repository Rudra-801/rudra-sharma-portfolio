// Mobile menu toggle
let menuBtn = document.querySelector('.menu-btn');
let navbar = document.querySelector('.navbar');
menuBtn.onclick = function() {
  navbar.style.display = (navbar.style.display === "flex") ? "none" : "flex";
};

// Particle background
const canvas = document.getElementById("particles");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let particlesArray = [];
const colors = ["#ff4ded","#b84dff","#00f0ff"];

class Particle {
  constructor(x,y,dx,dy,size,color){
    this.x=x;this.y=y;this.dx=dx;this.dy=dy;this.size=size;this.color=color;
  }
  draw(){
    ctx.beginPath();
    ctx.arc(this.x,this.y,this.size,0,Math.PI*2,false);
    ctx.fillStyle=this.color;
    ctx.shadowColor=this.color;
    ctx.shadowBlur=20;
    ctx.fill();
  }
  update(){
    this.x+=this.dx;this.y+=this.dy;
    if(this.x<0||this.x>canvas.width) this.dx*=-1;
    if(this.y<0||this.y>canvas.height) this.dy*=-1;
    this.draw();
  }
}

function init(){
  particlesArray=[];
  for(let i=0;i<70;i++){
    let size=Math.random()*3+1;
    let x=Math.random()*canvas.width;
    let y=Math.random()*canvas.height;
    let dx=(Math.random()-0.5)*1;
    let dy=(Math.random()-0.5)*1;
    let color=colors[Math.floor(Math.random()*colors.length)];
    particlesArray.push(new Particle(x,y,dx,dy,size,color));
  }
}

function animate(){
  requestAnimationFrame(animate);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  particlesArray.forEach(p=>p.update());
}

init();animate();
window.addEventListener("resize",()=>{
  canvas.width=window.innerWidth;
  canvas.height=window.innerHeight;
  init();
});
