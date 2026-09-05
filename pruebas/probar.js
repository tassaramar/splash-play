/* =====================================================================
   Prueba automática de Splash Play.

   Corre el juego SIN navegador y lo juega un "robot", para comprobar que
   los 5 niveles se pueden ganar con los 6 animales. Sirve para encontrar
   trampas (lugares donde el juego se traba) sin tener que jugar horas.

   Se corre así, desde la carpeta del juego:
       node pruebas/probar.js
   ===================================================================== */
const fs = require('fs'), vm = require('vm'), path = require('path');
const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const codigo = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const nada = () => {};
const ctxFalso = new Proxy({}, { get:(t,k)=> {
  if(k==='createLinearGradient'||k==='createRadialGradient') return ()=>({addColorStop:nada});
  if(k==='canvas') return {width:0,height:0};
  return typeof k === 'string' ? nada : undefined;
}, set:()=>true });

function elem(){ const e = { hidden:false, innerHTML:'', style:{}, className:'',
  appendChild:nada, onclick:null, addEventListener:nada }; return e; }

const almacen = {};
const sandbox = {
  console,
  document: { getElementById:()=>elem(), createElement:()=>elem(), addEventListener:nada, hidden:false },
  window: { addEventListener:nada, devicePixelRatio:1 },
  localStorage: { getItem:k=>almacen[k]||null, setItem:(k,v)=>almacen[k]=v },
  requestAnimationFrame: nada,
  setInterval: ()=>0, clearInterval: nada, setTimeout: nada,
  Math, Date, JSON,
};
sandbox.globalThis = sandbox;
sandbox.document.getElementById = (id) => (sandbox.__els[id] ||= (id==='lienzo' ? {getContext:()=>ctxFalso, width:0, height:0, style:{}} : elem()));
sandbox.__els = {};

vm.createContext(sandbox);
vm.runInContext(codigo + `
globalThis.__api = { empezarNivel, actualizar, teclas, get juego(){return juego}, set juego(v){juego=v},
                     get pantalla(){return pantalla}, guardado, alturaEn, zonaEn, NIVELES, ANIMALES,
                     poderes, anotar };
`, sandbox);

const api = sandbox.__api;
vm.runInContext('globalThis.__deslizar = deslizar;', sandbox);
sandbox.__deslizar = sandbox.__deslizar || (()=>{});

/* ---------- El robot que juega ---------- */
function robot(){
  const g = api.juego, j = g.jug, t = api.teclas;
  const antes = t['ArrowRight'];
  for(const k in t) t[k] = false;
  robot.antesDeslizar = antes;
  const z = api.zonaEn(j.x, j.paso);

  if(z && z.clase === 'escalera'){
    /* En la escalera: salta cuando pasó 25px del centro del cubo donde está parado */
    if(j.enPiso){
      let cubo = null;
      for(const p of g.nivel.plataformas){
        if(p.paso !== j.paso) continue;
        if(j.x >= p.x1-2 && j.x <= p.x2+2 && Math.abs(p.y - j.y) < 2){
          if(!cubo || p.y > cubo.y) cubo = p;
        }
      }
      if(cubo){
        const centro = (cubo.x1 + cubo.x2)/2;
        const off = (j.x - centro) * j.dir;
        const esPiso = Math.abs(j.y - z.y) < 2;
        if(esPiso || off >= 25) t['Space'] = true;
      }
    }
    return;
  }

  /* En la pista: mirar el próximo obstáculo y el próximo pozo */
  let mejor = null;
  for(const o of g.nivel.obstaculos){
    if(o.paso !== j.paso) continue;
    const d = (o.x - j.x) * j.dir;
    if(d > -90 && d < 400 && (!mejor || d < mejor.d)) mejor = { o, d };
  }
  if(mejor){
    if(mejor.o.tipo === 'alto'){
      if(mejor.d < 170) t['ArrowDown'] = true;   // se queda agachada hasta pasarlo
    } else if(mejor.d < 150 && mejor.d > -20){
      t['Space'] = true;
    }
  }
  /* si no hay nada cerca, se desliza para ganar distancia (lo que haría un jugador) */
  if(!process.env.TORPE && (!mejor || mejor.d > 320) && j.enPiso && j.deslizEspera <= 0 && (!z || z.clase !== 'escalera')) t['ArrowRight'] = true;
  if(z && z.pozo){
    const borde = j.dir > 0 ? z.pozo.a : z.pozo.b;
    const d = (borde - j.x) * j.dir;
    if(d > 0 && d < 90 && j.enPiso) t['Space'] = true;
  }
}

/* ---------- Correr las pruebas ---------- */
let fallos = 0;
for(const animal of ['conejo','zorro','gato','panda','dino','perro']){
  api.guardado.animalElegido = animal;
  for(let n = 1; n <= 5; n++){
    let ganadas = 0, motivos = [];
    for(let intento = 0; intento < 6; intento++){
      api.empezarNivel(n);
      let pasos = 0;
      while(!api.juego.terminado && pasos < 6000){
        robot();
        if(api.teclas['ArrowRight'] && !robot.antesDeslizar) sandbox.__deslizar();
        api.actualizar(1/60);
        pasos++;
      }
      if(api.juego.terminado === 'gane') ganadas++;
      else motivos.push((sandbox.__els['txtPerdi'] && sandbox.__els['txtPerdi'].innerHTML || 'colgado').split('<br>')[0]
                        + ' @' + (api.juego.jug.avance/api.juego.nivel.total*100).toFixed(0) + '%');
    }
    const ok = ganadas >= 4;
    if(!ok) fallos++;
    console.log(`${ok?'✅':'❌'} ${animal.padEnd(7)} nivel ${n}: ganó ${ganadas}/6  ${motivos.length?'('+motivos.join(',')+')':''}`);
  }
}
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} combinaciones con problemas`);
