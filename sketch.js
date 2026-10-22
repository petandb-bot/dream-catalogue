'use strict';

window.DC_SCRIPT_LOADED = true;

const APP = {
  version: '0.2.4',
  mode: 'HALO',
  params: { light: 70, atmosphere: 82, color: 90, sourceColor: 18 },
  recipe: null,
  history: [],
  source: null,
  sourceName: '',
  shaders: {},
  ready: false,
  busy: false
};

const IDS = [
  'openPhotoTop','openPhotoPrimary','photoInput','canvasMount','emptyState','revealButton','backButton','editToggle','editChevron','editPanel','saveButton',
  'lightSlider','lightValue','atmosphereSlider','atmosphereValue','colorSlider','colorValue','sourceColorSlider','sourceColorValue','exportSize','renderOverlay','renderLabel','statusText','variationMeta','errorPanel','errorDetail'
];

const VERT = `
precision highp float;
attribute vec3 aPosition;
attribute vec2 aTexCoord;
uniform mat4 uModelViewProjectionMatrix;
varying vec2 vTexCoord;
void main(){vTexCoord=aTexCoord;gl_Position=uModelViewProjectionMatrix*vec4(aPosition,1.0);}`;

const COMMON = `
precision highp float;
varying vec2 vTexCoord;
uniform sampler2D uTex;
uniform vec2 uResolution;
uniform float uLight;
uniform float uAtmosphere;
uniform float uColor;
uniform float uSourceColor;
uniform float uSeed;
uniform vec4 uH0;
uniform vec4 uH1;
uniform vec4 uH2;
uniform vec4 uR0;
uniform vec4 uR1;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;

float sat(float x){return clamp(x,0.0,1.0);}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec2 mirrorUV(vec2 uv){vec2 q=mod(uv,2.0);return 1.0-abs(q-1.0);}
vec3 tex(vec2 uv){return texture2D(uTex,clamp(uv,0.0,1.0)).rgb;}
vec3 texM(vec2 uv){return texture2D(uTex,mirrorUV(uv)).rgb;}
float hash21(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);float a=hash21(i),b=hash21(i+vec2(1,0)),c=hash21(i+vec2(0,1)),d=hash21(i+vec2(1,1));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
float fbm4(vec2 p){float v=0.0,a=.52;mat2 m=mat2(1.57,1.11,-1.11,1.57);for(int i=0;i<4;i++){v+=a*noise2(p);p=m*p+13.71;a*=.48;}return v;}
float ridge(float x){return 1.0-abs(2.0*x-1.0);}
vec2 rot2(vec2 p,float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c)*p;}
float blob(vec2 uv,vec2 c,vec2 size,float a){vec2 q=rot2(uv-c,a)/max(size,vec2(.001));return exp(-dot(q,q)*2.05);}
float edge(vec2 uv,float px){vec2 dx=vec2(px,0),dy=vec2(0,px);float ex=abs(lum(texM(uv+dx))-lum(texM(uv-dx)));float ey=abs(lum(texM(uv+dy))-lum(texM(uv-dy)));return sat((ex+ey)*2.05);}
float bright(vec2 uv,float t){float y=lum(texM(uv));return smoothstep(t-.06,t+.08,y)*sat((y-t+.09)/(1.08-t));}
float ringBright(vec2 uv,float r,float t){vec2 px=vec2(1.0)/uResolution;vec2 x=vec2(r*px.x,0),y=vec2(0,r*px.y);float s=0.0;s+=bright(uv+x,t);s+=bright(uv-x,t);s+=bright(uv+y,t);s+=bright(uv-y,t);s+=bright(uv+x+y,t);s+=bright(uv+x-y,t);s+=bright(uv-x+y,t);s+=bright(uv-x-y,t);return s*.125;}
vec3 screenBlend(vec3 a,vec3 b){return 1.0-(1.0-a)*(1.0-b);}
vec3 softLight(vec3 b,vec3 s){return mix(sqrt(max(b,0.0))*(2.0*s-1.0)+2.0*b*(1.0-s),b-(1.0-2.0*s)*b*(1.0-b),step(.5,s));}
vec3 satAdjust(vec3 c,float a){float y=lum(c);return mix(vec3(y),c,a);}
vec3 hueRotateYIQ(vec3 c,float a){float Y=dot(c,vec3(.299,.587,.114));float I=dot(c,vec3(.596,-.274,-.322));float Q=dot(c,vec3(.211,-.523,.312));float cs=cos(a),sn=sin(a);float I2=I*cs-Q*sn;float Q2=I*sn+Q*cs;return vec3(Y+.956*I2+.621*Q2,Y-.272*I2-.647*Q2,Y-1.106*I2+1.703*Q2);}
vec3 sampleBlur9(vec2 uv,vec2 r){vec3 s=texM(uv)*.20;s+=texM(uv+r*vec2(1,0))*.10;s+=texM(uv+r*vec2(-1,0))*.10;s+=texM(uv+r*vec2(0,1))*.10;s+=texM(uv+r*vec2(0,-1))*.10;s+=texM(uv+r*vec2(.8,.8))*.10;s+=texM(uv+r*vec2(-.8,.8))*.10;s+=texM(uv+r*vec2(.8,-.8))*.10;s+=texM(uv+r*vec2(-.8,-.8))*.10;return s;}
vec3 softShoulder(vec3 c){return c/(vec3(1.0)+max(c-vec3(.72),vec3(0.0))*.90);}
float grain(vec2 uv){return hash21(floor(uv*uResolution)+uSeed*17.0)-.5;}

vec3 spectrumGrade(vec3 base,float amount){
  vec3 c=clamp(base,0.0,1.0);
  float y=lum(c);
  float sh=1.0-smoothstep(.10,.56,y);
  float hi=smoothstep(.46,.94,y);
  float mid=sat(1.0-sh-hi);
  float w=max(sh+mid+hi,.001);
  vec3 target=(uC0*sh+uC1*mid+uC2*hi)/w;
  float ty=max(lum(target),.025);
  target*=mix(.50,1.28,y)/ty;
  float a=(uR0.x-.5)*2.55;
  vec3 rotated=hueRotateYIQ(c,a*amount*(.28+.72*mid));
  vec3 x=mix(rotated,target,sat((.34+.48*uColor)*amount));
  vec3 q;
  q.r=x.r*(.78+.26*uR0.y)+x.g*(.03+.16*uR0.z)+x.b*(.02+.12*uR1.x);
  q.g=x.g*(.78+.24*uR0.z)+x.b*(.03+.15*uR1.y)+x.r*(.02+.11*uR0.w);
  q.b=x.b*(.78+.26*uR1.x)+x.r*(.03+.17*uR1.z)+x.g*(.02+.12*uR1.y);
  float qy=max(lum(q),.002);
  q*=mix(y,mix(y,qy,.30),.76)/qy;
  q=satAdjust(q,mix(.78,1.55,uR1.z));
  return mix(base,clamp(q,0.0,1.30),sat(amount));
}
vec3 sourceColorRecovery(vec3 base,vec3 processed){
  float keep=sat(uSourceColor);keep=keep*keep*(3.0-2.0*keep);
  float yp=max(lum(processed),.002),yb=max(lum(base),.018);
  vec3 src=clamp(base*(yp/yb),0.0,1.30);
  vec3 pc=processed-vec3(yp);
  vec3 sc=src-vec3(lum(src));
  return clamp(vec3(yp)+mix(pc,sc,keep),0.0,1.30);
}
vec3 phenomenonTint(vec3 c,float mask,float amount){
  float y=max(lum(c),.002);
  vec3 t=uC3*(y/max(lum(uC3),.02));
  return mix(c,clamp(t,0.0,1.35),sat(mask*amount*uColor));
}
float pseudoDepth(vec2 uv){float e=edge(uv,1.6/uResolution.x);float y=lum(texM(uv));float nearBias=smoothstep(.35,1.0,uv.y);return sat(nearBias*.46+e*.40+(1.0-y)*.14);}
float beam(vec2 uv,vec2 origin,float angle,float width,float falloff){vec2 q=rot2(uv-origin,-angle);float fwd=smoothstep(-.08,.05,q.x);float w=max(.012,width+max(q.x,0.0)*.11);float cross=exp(-(q.y*q.y)/(w*w));float fade=exp(-max(q.x,0.0)*falloff);return fwd*cross*fade;}
float smokeTrail(vec2 uv,vec2 origin,float width,float height,float wind,float phase){
  float rise=(origin.y-uv.y)/max(height,.06);
  float active=smoothstep(-.06,.05,rise)*(1.0-smoothstep(.94,1.25,rise));
  float drift=(fbm4(vec2(rise*.92,phase*4.1)+12.0)-.5)*width*.78;
  float center=origin.x+wind*rise+sin(rise*5.2+phase*6.2831)*width*.18+drift;
  float w=width*(.42+max(rise,0.0)*.94)*( .80+.22*sin(rise*7.0+phase*4.0));
  float xn=(uv.x-center)/max(abs(w),.016);
  vec2 p=vec2(xn*.60,rise*1.10);
  float macro=fbm4(p*.86+phase*19.0);
  float inner=fbm4(p*1.58+phase*31.0);
  float body=exp(-xn*xn*1.20)*active;
  float billow=smoothstep(.22,.78,macro*.66+inner*.34);
  return body*(.34+.66*billow);
}
`;


const HALO_FRAG = COMMON + `
void main(){
  vec2 uv=vTexCoord;vec3 base=tex(uv);vec2 px=vec2(1.0)/uResolution;
  vec3 graded=sourceColorRecovery(base,spectrumGrade(base,.56+.44*uColor));
  float th=mix(.80,.48,uLight);
  float b1=ringBright(uv,mix(2.0,5.5,uH0.y),th);
  float b2=ringBright(uv,mix(8.0,20.0,uH0.z),th-.04);
  float b3=ringBright(uv,mix(24.0,58.0,uH1.w),th-.09);
  float e=edge(uv,2.0/uResolution.x);
  float halo=sat((b1*.72+b2*.96+b3*.88)*(.82+uLight*1.48)+e*uAtmosphere*.30);
  vec3 blurWide=sampleBlur9(uv,px*mix(8.0,24.0,uH0.x));
  vec3 outc=mix(graded,blurWide,(.05+.18*uAtmosphere)*smoothstep(.02,.80,halo+b3*.8));
  vec2 o1=vec2(-.12,mix(.10,.90,uH0.x));
  vec2 o2=vec2(mix(.12,.88,uH1.x),-.10);
  vec2 o3=vec2(1.12,mix(.08,.92,uH2.z));
  float r1=beam(uv,o1,mix(-.30,.32,uH1.z),mix(.025,.090,uH0.w),mix(.45,1.35,uH2.y));
  float r2=beam(uv,o2,mix(.95,1.65,uH2.x),mix(.018,.070,uH1.y),mix(.42,1.18,uH0.z));
  float r3=beam(uv,o3,mix(2.78,3.46,uH2.w),mix(.018,.078,uH1.w),mix(.45,1.28,uH0.y));
  float rayNoise=.70+.30*fbm4(uv*2.0+uSeed*.031);
  float rays=sat((r1*.88+r2*.72+r3*.62)*rayNoise*uLight*uAtmosphere);
  vec3 haloCol=mix(uC2,uC3,.44+.36*uR1.y);
  outc=screenBlend(outc,haloCol*halo*(.24+.96*uLight));
  outc=screenBlend(outc,uC3*rays*(.18+.68*uColor));
  float blow=sat((b1*.05+b2*.13+b3*.19)*uLight*(.92+uAtmosphere*.56));
  outc=mix(outc,vec3(1.0),blow);
  float leak=smoothstep(.54,.88,fbm4(rot2(uv-.5,(uH1.x-.5)*1.4)*mix(.82,1.48,uH0.z)+uSeed*.013));
  leak*=uAtmosphere*uColor*(.08+.20*uR0.w);
  outc=screenBlend(outc,uC3*leak);
  outc+=vec3(grain(uv)*(.008+.016*uAtmosphere));
  gl_FragColor=vec4(clamp(outc,0.0,1.0),1.0);
}`;

const VEIL_FRAG = COMMON + `
void main(){
  vec2 uv=vTexCoord;vec3 base=tex(uv);vec2 px=vec2(1.0)/uResolution;
  vec3 graded=sourceColorRecovery(base,spectrumGrade(base,.50+.42*uColor));
  vec2 p=rot2(uv-.5,mix(-.72,.72,uH0.x));
  float f0=fbm4(p*.54+vec2(uSeed*.010,3.7));
  float f1=fbm4(p*1.04+vec2(17.3,uSeed*.009));
  float f2=fbm4(p*1.72+vec2(31.9,uSeed*.013));
  float thickness=smoothstep(.24,.80,f0*.58+f1*.30+f2*.12);
  float pocket=smoothstep(.56,.84,fbm4(p*1.20+vec2(51.0,uSeed*.011)));
  thickness*=mix(1.08,.72,pocket);
  float sheet=pow(sat(.5+.5*sin(p.x*2.2+f0*3.7+uH1.w*6.2831)),3.0);
  float membrane=sat((thickness*.72+sheet*.28)*(.70+.72*uAtmosphere));
  vec2 disp=vec2(noise2(p*3.0+vec2(uSeed,4.1))-.5,noise2(p*3.0+vec2(17.0,uSeed))-.5)*px*mix(1.0,6.0,uAtmosphere)*membrane;
  vec3 refr=texM(uv+disp);vec3 blur=sampleBlur9(uv+disp,px*mix(2.0,8.0,uH2.z));
  vec3 behind=mix(refr,blur,membrane*(.08+.20*uAtmosphere));
  float hi=bright(uv,mix(.76,.46,uLight));float ring=ringBright(uv,mix(6.0,22.0,uH1.y),mix(.74,.50,uLight));float e=edge(uv,1.6/uResolution.x);
  float catchLight=sat(hi*.72+ring*.78+e*.28);
  float wet1=blob(uv,vec2(mix(.10,.90,uH0.y),mix(.08,.92,uH1.x)),vec2(mix(.20,.46,uH2.x),mix(.16,.38,uH2.y)),mix(-1.0,1.0,uR0.z));
  float wet2=blob(uv,vec2(mix(.08,.92,uH2.z),mix(.08,.92,uH0.w)),vec2(mix(.16,.38,uH1.y),mix(.18,.42,uH1.w)),mix(-1.2,1.2,uR1.y));
  float luminousScar=smoothstep(.66,.88,fbm4(rot2(p,(uR0.w-.5)*1.4)*1.86+uSeed*.019));
  luminousScar*=smoothstep(.14,.82,membrane)*(.22+.78*catchLight);
  float local=sat(membrane+wet1*.28+wet2*.20);
  vec3 outc=mix(graded,behind,local*(.08+.18*uAtmosphere));
  outc=phenomenonTint(outc,local,.38+.34*uAtmosphere);
  float sheen=local*(.06+.22*uLight)+catchLight*membrane*(.20+.54*uLight);
  outc=screenBlend(outc,uC3*sheen);
  outc=screenBlend(outc,mix(uC2,vec3(1.0),.40)*luminousScar*(.10+.30*uLight));
  float milk=membrane*(.020+.065*uAtmosphere)*(1.0-catchLight*.35);outc=mix(outc,vec3(1.0),milk);
  float chromaSlip=catchLight*local*uColor*(.025+.07*uR1.z);vec3 slip=vec3(texM(uv+disp*1.6+px*2.0).r,behind.g,texM(uv-disp*1.4-px*2.0).b);outc=mix(outc,slip,chromaSlip);
  outc+=vec3(grain(uv)*(.003+.007*uAtmosphere));outc=softShoulder(outc);
  gl_FragColor=vec4(clamp(outc,0.0,1.0),1.0);
}`;

const SMOKE_FRAG = COMMON + `
void main(){
  vec2 uv=vTexCoord;vec3 base=tex(uv);vec2 px=vec2(1.0)/uResolution;
  vec3 graded=sourceColorRecovery(base,spectrumGrade(base,.52+.44*uColor));
  vec2 o1=vec2(mix(.05,.28,uH0.y),mix(.86,1.07,uH0.z));
  vec2 o2=vec2(mix(.30,.58,uH1.x),mix(.84,1.06,uH1.y));
  vec2 o3=vec2(mix(.58,.92,uH2.x),mix(.86,1.09,uH2.y));
  vec2 o4=vec2(mix(.12,.88,uR0.z),mix(.88,1.10,uR1.x));
  float t1=smokeTrail(uv,o1,mix(.14,.28,uH0.x),mix(.76,1.12,uH1.w),mix(-.22,.20,uH1.z),uH0.w);
  float t2=smokeTrail(uv,o2,mix(.12,.25,uH2.z),mix(.72,1.06,uH2.w),mix(-.18,.20,uH0.w),uH1.y+.31);
  float t3=smokeTrail(uv,o3,mix(.11,.23,uH1.x),mix(.68,1.02,uH0.z),mix(-.18,.18,uH2.x),uH2.z+.63);
  float t4=smokeTrail(uv,o4,mix(.08,.18,uR0.y),mix(.58,.90,uR1.z),mix(-.14,.14,uR0.x),uR1.y+.17);
  float macro=fbm4(uv*.62+vec2(uSeed*.010,7.4));float inner=fbm4(uv*1.74+vec2(uSeed*.018,31.7));
  float core=t1*1.00+t2*.88+t3*.78+t4*.50;core*=.82+.34*macro;
  float gap=smoothstep(.62,.86,fbm4(rot2(uv-.5,(uR0.w-.5)*1.0)*1.18+vec2(44.0,uSeed*.012)));core*=1.0-gap*.30;
  float lowMist=blob(uv,vec2(mix(.16,.84,uR1.x),mix(.78,.98,uR1.y)),vec2(mix(.24,.54,uR0.z),mix(.08,.18,uR1.z)),mix(-.30,.30,uR0.y));
  lowMist*=smoothstep(.26,.78,fbm4(vec2(uv.x*.80-uSeed*.010,uv.y*1.40+21.0)))*(.10+.22*uAtmosphere);
  float density=smoothstep(.045,.78,core+lowMist*.32)*(.72+.88*uAtmosphere);density=sat(density*(.90+.16*inner));
  vec2 refr=vec2(noise2(uv*4.2+vec2(uSeed,4.1))-.5,noise2(uv*4.0+vec2(13.1,uSeed))-.5)*px*mix(1.0,5.0,uAtmosphere)*(density+lowMist*.3);
  vec3 warped=texM(uv+refr);vec3 blur=sampleBlur9(uv+refr,px*mix(3.0,10.0,uH1.w));vec3 behind=mix(warped,blur,density*(.12+.24*uAtmosphere));
  float hi=bright(uv,mix(.74,.48,uLight));float ring=ringBright(uv,mix(7.0,22.0,uH1.y),mix(.72,.50,uLight));float e=edge(uv,1.4/uResolution.x);
  float backlit=sat((hi*.62+ring*.58+e*.12)*density)*(.25+.82*uLight);
  float optical=density*(.62+1.00*uAtmosphere)+lowMist*(.10+.28*uAtmosphere);float trans=exp(-optical);
  vec3 smokeCol=mix(uC3,mix(uC1,vec3(.95),.55),.38+.38*uR0.y);
  vec3 smoky=behind*trans+smokeCol*(1.0-trans)*(.48+.28*uColor);
  smoky=screenBlend(smoky,mix(smokeCol,vec3(1.0),.52)*backlit*(.16+.36*uLight));
  float wisp=smoothstep(.50,.84,inner)*density*(1.0-trans);smoky=screenBlend(smoky,mix(uC2,vec3(1.0),.48)*wisp*(.06+.16*uLight));
  float anomalyGate=1.0-step(.26,uR1.w);float shard=pow(smoothstep(.72,.90,fbm4(uv*3.2+vec2(uSeed*.021,61.0))),1.7)*density*anomalyGate;smoky=mix(smoky,softLight(smoky,mix(uC3,vec3(1.0),.44)),shard*.12);
  vec3 outc=mix(graded,smoky,sat(density*(.68+.38*uAtmosphere)+lowMist*.18));outc=phenomenonTint(outc,density,.18+.22*uAtmosphere);
  outc+=vec3(grain(uv)*(.003+.007*uAtmosphere));outc=softShoulder(outc);
  gl_FragColor=vec4(clamp(outc,0.0,1.0),1.0);
}`;

const PRISM_FRAG = COMMON + `
void main(){
  vec2 uv=vTexCoord;vec3 base=tex(uv);vec2 px=vec2(1.0)/uResolution;
  vec3 scene=sourceColorRecovery(base,spectrumGrade(base,.44+.38*uColor));
  vec2 dir=normalize(vec2(cos(uH0.x*6.2831),sin(uH0.x*6.2831)));
  float spread=mix(3.0,25.0,uLight)*mix(.72,1.42,uH0.y);vec2 off=dir*px*spread;
  vec3 chroma=vec3(texM(uv+off*1.2).r,texM(uv).g,texM(uv-off*1.2).b);
  float field=fbm4(uv*mix(.82,2.05,uH0.z)+uSeed*.010);
  float phase=dot(uv,dir)*mix(4.2,11.0,uH1.x)+field*2.8;
  float band=pow(.5+.5*sin(phase),mix(4.0,9.0,uH1.y));
  float hi=bright(uv,mix(.72,.49,uLight));float e=edge(uv,1.6/uResolution.x);
  float local=sat(.10+hi*.66+e*.48+band*uAtmosphere*.22);
  vec3 outc=mix(scene,chroma,(.08+.28*uColor)*local);
  float leak=sat(band*uAtmosphere*(.38+.62*local));
  outc=screenBlend(outc,uC3*leak*(.26+.54*uColor));
  float caustic=pow(sat(ridge(fbm4(rot2(uv-.5,(uR0.y-.5)*1.6)*2.2+uSeed*.017)*1.42)),5.0);
  caustic*=hi*uAtmosphere*(.08+.20*uR1.x);
  outc=screenBlend(outc,mix(uC2,uC3,.5)*caustic);
  float bloom=ringBright(uv,mix(8.0,24.0,uH1.w),mix(.66,.52,uLight))*uLight;
  outc=screenBlend(outc,mix(vec3(.96),uC3,.28)*bloom*(.40+.18*uAtmosphere));
  outc+=vec3(grain(uv)*.006);outc=softShoulder(outc);
  gl_FragColor=vec4(clamp(outc,0.0,1.0),1.0);
}`;

const SPECTRA = [
  {name:'XENON',       c0:[.34,.48,.88],c1:[.62,.82,1.00],c2:[.88,.94,1.00],c3:[.56,.78,1.00]},
  {name:'UV',          c0:[.46,.34,.78],c1:[.72,.56,.98],c2:[.94,.82,1.00],c3:[.68,.48,1.00]},
  {name:'MAGENTA',     c0:[.52,.32,.54],c1:[.96,.56,.78],c2:[1.00,.86,.92],c3:[1.00,.42,.72]},
  {name:'MERCURY',     c0:[.26,.50,.54],c1:[.54,.86,.74],c2:[.86,1.00,.90],c3:[.36,.94,.78]},
  {name:'SODIUM',      c0:[.44,.38,.28],c1:[.94,.68,.34],c2:[1.00,.92,.68],c3:[1.00,.62,.22]},
  {name:'CYAN BLEACH', c0:[.26,.50,.64],c1:[.44,.86,.94],c2:[.88,1.00,1.00],c3:[.18,.88,1.00]},
  {name:'GREEN CHEM',  c0:[.28,.46,.38],c1:[.58,.82,.56],c2:[.90,.98,.76],c3:[.42,.88,.54]},
  {name:'LAVENDER',    c0:[.40,.42,.68],c1:[.70,.68,.92],c2:[.96,.90,1.00],c3:[.74,.62,.98]},
  {name:'AMBER BURN',  c0:[.46,.34,.28],c1:[.88,.54,.36],c2:[1.00,.86,.72],c3:[1.00,.48,.24]},
  {name:'SILVER BLUE', c0:[.38,.46,.58],c1:[.68,.78,.88],c2:[.96,.98,1.00],c3:[.62,.78,.94]}
];

let ui = {};

function setup(){
  try{
    ui=bindUI();
    const c=createCanvas(960,720,WEBGL);
    c.parent('canvasMount');
    pixelDensity(Math.min(window.devicePixelRatio||1,2));
    noStroke();
    APP.shaders.HALO=createShader(VERT,HALO_FRAG);
    APP.shaders.VEIL=createShader(VERT,VEIL_FRAG);
    APP.shaders.SMOKE=createShader(VERT,SMOKE_FRAG);
    APP.shaders.PRISM=createShader(VERT,PRISM_FRAG);
    APP.recipe=makeRecipe(APP.mode);
    APP.ready=true;
    window.DC_BOOT_OK=true;
    wireUI();
    syncControls();
    setMode(APP.mode,false);
    background(0,0);
    noLoop();
  }catch(err){showError(err);}
}

function bindUI(){
  const out={};
  for(const id of IDS){
    const el=document.getElementById(id);
    if(!el) throw new Error('UI ERROR / HTML ELEMENT MISSING / '+id);
    out[id]=el;
  }
  out.modeButtons=[...document.querySelectorAll('.mode')];
  if(out.modeButtons.length!==4) throw new Error('UI ERROR / MODE BUTTONS');
  return out;
}

function wireUI(){
  ui.openPhotoTop.addEventListener('click',()=>ui.photoInput.click());
  ui.openPhotoPrimary.addEventListener('click',()=>ui.photoInput.click());
  ui.photoInput.addEventListener('change',handleFile);
  ui.modeButtons.forEach(btn=>btn.addEventListener('click',()=>setMode(btn.dataset.mode,true)));
  ui.revealButton.addEventListener('click',reveal);
  ui.backButton.addEventListener('click',goBack);
  ui.editToggle.addEventListener('click',toggleEdit);
  ui.saveButton.addEventListener('click',saveHighRes);
  bindSlider(ui.lightSlider,ui.lightValue,'light');
  bindSlider(ui.atmosphereSlider,ui.atmosphereValue,'atmosphere');
  bindSlider(ui.colorSlider,ui.colorValue,'color');
  bindSlider(ui.sourceColorSlider,ui.sourceColorValue,'sourceColor');
}

function bindSlider(input,output,key){
  input.addEventListener('input',()=>{APP.params[key]=Number(input.value);output.value=input.value;renderPreview();});
}

function syncControls(){
  for(const key of ['light','atmosphere','color','sourceColor']){
    ui[key+'Slider'].value=APP.params[key];
    ui[key+'Value'].value=APP.params[key];
  }
}

function handleFile(e){
  const file=e.target.files&&e.target.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){showError(new Error('Please choose an image file.'));return;}
  setBusy(true,'OPENING');
  const url=URL.createObjectURL(file);
  loadImage(url,img=>{
    URL.revokeObjectURL(url);
    APP.source=img;
    APP.sourceName=file.name||'photo';
    APP.history=[];
    APP.recipe=makeRecipe(APP.mode);
    fitPreviewCanvas(img.width,img.height);
    ui.emptyState.hidden=true;
    ui.saveButton.disabled=false;
    ui.backButton.disabled=true;
    ui.statusText.textContent='READY / '+APP.mode;
    renderPreview();
    setBusy(false);
  },err=>{URL.revokeObjectURL(url);setBusy(false);showError(err||new Error('Image could not be opened.'));});
}

function fitPreviewCanvas(w,h){
  const maxDim=window.innerWidth<821?1180:1500;
  const s=Math.min(1,maxDim/Math.max(w,h));
  resizeCanvas(Math.max(2,Math.round(w*s)),Math.max(2,Math.round(h*s)));
}

function setMode(mode,push=true){
  if(!APP.shaders[mode]) return;
  if(push&&APP.source) pushHistory();
  APP.mode=mode;
  APP.recipe=makeRecipe(mode);
  document.documentElement.dataset.mode=mode.toLowerCase();
  ui.modeButtons.forEach(b=>{const on=b.dataset.mode===mode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on?'true':'false');});
  ui.statusText.textContent=APP.source?'READY / '+mode:'READY / ADD A PHOTO';
  updateVariation();
  renderPreview();
}

function reveal(){
  if(!APP.source){ui.photoInput.click();return;}
  pushHistory();
  APP.recipe=makeRecipe(APP.mode);
  updateVariation();
  pulseButton();
  renderPreview();
}

function pushHistory(){
  APP.history.push({mode:APP.mode,params:{...APP.params},recipe:JSON.parse(JSON.stringify(APP.recipe))});
  if(APP.history.length>20) APP.history.shift();
  ui.backButton.disabled=APP.history.length===0;
}

function goBack(){
  if(!APP.history.length) return;
  const prev=APP.history.pop();
  APP.mode=prev.mode;APP.params={...prev.params};APP.recipe=prev.recipe;
  syncControls();
  document.documentElement.dataset.mode=APP.mode.toLowerCase();
  ui.modeButtons.forEach(b=>{const on=b.dataset.mode===APP.mode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',on?'true':'false');});
  ui.backButton.disabled=APP.history.length===0;
  updateVariation();
  renderPreview();
}

function toggleEdit(){
  const open=ui.editPanel.hidden;
  ui.editPanel.hidden=!open;
  ui.editToggle.setAttribute('aria-expanded',open?'true':'false');
  ui.editChevron.textContent=open?'−':'＋';
}

function makeRecipe(mode){
  const rnd=()=>Math.random();const r=(a,b)=>a+(b-a)*rnd();
  const seed=rnd()*99.0;
  let pool=[0,1,2,3,4,5,6,7,8,9];
  if(mode==='HALO') pool=[0,1,2,4,5,7,8,9];
  if(mode==='VEIL') pool=[0,1,2,3,5,7,9];
  if(mode==='SMOKE') pool=[0,1,3,5,6,7,9];
  if(mode==='PRISM') pool=[0,1,2,3,5,7,8,9];
  const s=SPECTRA[pool[Math.floor(rnd()*pool.length)]];
  let h0,h1,h2,count;
  if(mode==='HALO'){h0=[r(.08,.94),r(.08,.94),r(.08,.92),rnd()];h1=[rnd(),rnd(),rnd(),rnd()];h2=[rnd(),rnd(),rnd(),rnd()];count=16;}
  else if(mode==='VEIL'){h0=[rnd(),r(.12,.98),r(.18,.98),rnd()];h1=[rnd(),rnd(),rnd(),rnd()];h2=[rnd(),rnd(),rnd(),rnd()];count=24;}
  else if(mode==='SMOKE'){h0=[r(.14,.92),r(.06,.94),r(.18,.98),rnd()];h1=[r(.12,.94),r(.16,.98),rnd(),r(.18,.96)];h2=[r(.10,.94),r(.10,.94),rnd(),r(.14,.96)];count=28;}
  else{h0=[rnd(),r(.30,1.0),rnd(),rnd()];h1=[r(.30,1.0),rnd(),rnd(),rnd()];h2=[rnd(),rnd(),rnd(),rnd()];count=16;}
  return {seed,h0,h1,h2,r0:[rnd(),rnd(),rnd(),rnd()],r1:[rnd(),rnd(),rnd(),rnd()],c0:s.c0,c1:s.c1,c2:s.c2,c3:s.c3,spectrum:s.name,id:Math.floor(rnd()*count)+1};
}

function updateVariation(){if(ui.variationMeta) ui.variationMeta.textContent='CATALOGUE / '+APP.mode+' / '+String(APP.recipe?.id||1).padStart(2,'0')+' / '+(APP.recipe?.spectrum||'—');}
function pulseButton(){ui.revealButton.animate([{transform:'translateX(0)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:180,easing:'ease-out'});}

function setUniforms(sh,w,h){
  sh.setUniform('uTex',APP.source);sh.setUniform('uResolution',[w,h]);
  sh.setUniform('uLight',APP.params.light/100);sh.setUniform('uAtmosphere',APP.params.atmosphere/100);sh.setUniform('uColor',APP.params.color/100);sh.setUniform('uSourceColor',APP.params.sourceColor/100);
  sh.setUniform('uSeed',APP.recipe.seed);sh.setUniform('uH0',APP.recipe.h0);sh.setUniform('uH1',APP.recipe.h1);sh.setUniform('uH2',APP.recipe.h2);
  sh.setUniform('uR0',APP.recipe.r0);sh.setUniform('uR1',APP.recipe.r1);sh.setUniform('uC0',APP.recipe.c0);sh.setUniform('uC1',APP.recipe.c1);sh.setUniform('uC2',APP.recipe.c2);sh.setUniform('uC3',APP.recipe.c3);
}

function renderPreview(){
  if(!APP.ready||!APP.source) return;
  try{
    const sh=APP.shaders[APP.mode];
    shader(sh);setUniforms(sh,width,height);clear();plane(width,height,1,1);resetShader();
  }catch(err){showError(err);}
}

function setBusy(on,label='REVEALING'){
  APP.busy=on;ui.renderOverlay.hidden=!on;ui.renderLabel.textContent=label;ui.saveButton.disabled=on||!APP.source;
}

async function saveHighRes(){
  if(!APP.source||APP.busy) return;
  setBusy(true,'RENDERING');
  let g;
  try{
    const longSide=Number(ui.exportSize.value)||2600;
    const ratio=APP.source.width/APP.source.height;
    let outW,outH;
    if(ratio>=1){outW=longSide;outH=Math.max(2,Math.round(longSide/ratio));}
    else{outH=longSide;outW=Math.max(2,Math.round(longSide*ratio));}
    g=createGraphics(outW,outH,WEBGL);g.pixelDensity(1);g.noStroke();
    const sh=g.createShader(VERT,shaderSourceFor(APP.mode));
    g.shader(sh);setUniforms(sh,outW,outH);g.clear();g.plane(outW,outH,1,1);g.resetShader();
    await new Promise(r=>setTimeout(r,80));
    const blob=await canvasToBlob(g.canvas,'image/png');
    const base=(APP.sourceName||'dream-catalogue').replace(/\.[^.]+$/,'').replace(/[^a-z0-9_-]+/gi,'_');
    const file=new File([blob],`${base}_${APP.mode.toLowerCase()}_${Date.now()}.png`,{type:'image/png'});
    if(navigator.canShare&&navigator.canShare({files:[file]})) await navigator.share({files:[file],title:'Dream Catalogue'});
    else{const a=document.createElement('a');const objectURL=URL.createObjectURL(blob);a.href=objectURL;a.download=file.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(objectURL),1200);}
  }catch(err){showError(err);}finally{if(g)g.remove();setBusy(false);}
}

function shaderSourceFor(mode){return mode==='HALO'?HALO_FRAG:mode==='VEIL'?VEIL_FRAG:mode==='SMOKE'?SMOKE_FRAG:PRISM_FRAG;}
function canvasToBlob(c,type){return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(new Error('Export failed.')),type));}
function showError(err){const msg=err&&err.message?err.message:String(err);console.error(msg);if(ui.errorDetail){ui.errorDetail.textContent=msg;ui.errorPanel.hidden=false;}else alert(msg);}
function windowResized(){if(APP.source&&window.innerWidth<821) fitPreviewCanvas(APP.source.width,APP.source.height);renderPreview();}
