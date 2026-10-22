'use strict';

window.DC_SCRIPT_LOADED = true;

const APP = {
  version: '0.2.3.6',
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

float sat(float x){return clamp(x,0.0,1.0);} 
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec2 mirrorUV(vec2 uv){vec2 q=mod(uv,2.0);return 1.0-abs(q-1.0);} 
vec3 tex(vec2 uv){return texture2D(uTex,clamp(uv,0.0,1.0)).rgb;}
vec3 texM(vec2 uv){return texture2D(uTex,mirrorUV(uv)).rgb;}
float hash21(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);} 
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.0-15.0)+10.0);float a=hash21(i),b=hash21(i+vec2(1,0)),c=hash21(i+vec2(0,1)),d=hash21(i+vec2(1,1));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);} 
float fbm(vec2 p){float v=0.0,a=.5;mat2 m=mat2(1.53,1.17,-1.17,1.53);for(int i=0;i<6;i++){v+=a*noise2(p);p=m*p+17.13;a*=.5;}return v;}
float ridge(float x){return 1.0-abs(2.0*x-1.0);}
float edge(vec2 uv,float px){vec2 dx=vec2(px,0),dy=vec2(0,px);float ex=abs(lum(texM(uv+dx))-lum(texM(uv-dx)));float ey=abs(lum(texM(uv+dy))-lum(texM(uv-dy)));return sat((ex+ey)*2.15);} 
float bright(vec2 uv,float t){float y=lum(texM(uv));return smoothstep(t-.055,t+.075,y)*sat((y-t+.08)/(1.08-t));}
float ringBright(vec2 uv,float r,float t){vec2 px=vec2(1.0)/uResolution;vec2 x=vec2(r*px.x,0),y=vec2(0,r*px.y);float s=0.0;s+=bright(uv+x,t);s+=bright(uv-x,t);s+=bright(uv+y,t);s+=bright(uv-y,t);s+=bright(uv+x+y,t);s+=bright(uv+x-y,t);s+=bright(uv-x+y,t);s+=bright(uv-x-y,t);return s*.125;}
vec3 screenBlend(vec3 a,vec3 b){return 1.0-(1.0-a)*(1.0-b);} 
vec3 softLight(vec3 b,vec3 s){return mix(sqrt(max(b,0.0))*(2.0*s-1.0)+2.0*b*(1.0-s),b-(1.0-2.0*s)*b*(1.0-b),step(.5,s));}
vec2 rot2(vec2 p,float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c)*p;}
float blob(vec2 uv,vec2 c,vec2 size,float a){vec2 q=rot2(uv-c,a)/max(size,vec2(.001));return exp(-dot(q,q)*2.15);} 
vec3 paletteMap(vec3 base,vec3 lo,vec3 mid,vec3 hi,float amount){
  float y=lum(base);
  vec3 p=mix(lo,mid,smoothstep(.02,.58,y));
  p=mix(p,hi,smoothstep(.42,.98,y));
  vec3 mapped=p*mix(.40,1.32,y);
  return mix(base,clamp(mapped,0.0,1.0),sat(amount));
}
vec3 hueRotateYIQ(vec3 c,float a){
  float Y=dot(c,vec3(.299,.587,.114));
  float I=dot(c,vec3(.596,-.274,-.322));
  float Q=dot(c,vec3(.211,-.523,.312));
  float cs=cos(a),sn=sin(a);
  float I2=I*cs-Q*sn;
  float Q2=I*sn+Q*cs;
  return vec3(Y+.956*I2+.621*Q2,Y-.272*I2-.647*Q2,Y-1.106*I2+1.703*Q2);
}
vec3 satAdjust(vec3 c,float amount){float y=lum(c);return mix(vec3(y),c,amount);}
vec3 filmResponse(vec3 base,float amount){
  vec3 c=clamp(base,0.0,1.0);
  float y=lum(c);
  float sh=1.0-smoothstep(.10,.58,y);
  float hi=smoothstep(.44,.96,y);
  float mid=sat(1.0-sh-hi);
  float wsum=max(sh+mid+hi,.001);

  float aSh=(uH0.x-.5)*2.05;
  float aMid=(uH1.y-.5)*2.55;
  float aHi=(uH2.w-.5)*1.85;
  vec3 shC=hueRotateYIQ(c,aSh);
  vec3 midC=hueRotateYIQ(c,aMid);
  vec3 hiC=hueRotateYIQ(c,aHi);
  vec3 x=(shC*sh+midC*mid+hiC*hi)/wsum;

  vec3 q;
  q.r=x.r*(.72+.34*uH0.w)+x.g*(.04+.22*uH1.x)+x.b*(.02+.18*uH2.z);
  q.g=x.g*(.72+.31*uH1.y)+x.b*(.04+.19*uH0.x)+x.r*(.02+.15*uH2.w);
  q.b=x.b*(.72+.34*uH2.x)+x.r*(.04+.23*uH1.z)+x.g*(.02+.17*uH0.z);

  float yq=max(lum(q),.001);
  float targetY=mix(y,yq,.16+.16*uH1.w);
  q*=targetY/yq;

  vec3 shGain=mix(vec3(.72,.91,1.28),vec3(1.24,.74,1.04),uH1.z);
  vec3 midGain=mix(vec3(.82,1.14,1.22),vec3(1.20,.92,.76),uH0.y);
  vec3 hiGain=mix(vec3(.72,.96,1.30),vec3(1.28,.80,1.03),uH2.y);
  q*=mix(vec3(1.0),shGain,sh*amount*.56);
  q*=mix(vec3(1.0),midGain,mid*amount*.46);
  q*=mix(vec3(1.0),hiGain,hi*amount*.62);

  float yy=max(lum(q),.001);
  float contrast=mix(.88,1.22,uH2.y);
  float y2=sat((yy-.5)*contrast+.5+(uH1.x-.5)*.08*amount);
  q*=max(y2,.008)/yy;
  float satAmt=mix(.74,1.62,uH2.z);
  q=satAdjust(q,mix(1.0,satAmt,amount));
  return mix(base,clamp(q,0.0,1.22),sat(amount));
}
vec3 sourceColorMix(vec3 base,vec3 graded){
  float keep=sat(uSourceColor);
  keep=keep*keep*(3.0-2.0*keep);
  float yg=max(lum(graded),.001);
  float yb=max(lum(base),.018);
  vec3 sourceTone=clamp(base*(yg/yb),0.0,1.28);
  vec3 procChroma=graded-vec3(yg);
  vec3 srcChroma=sourceTone-vec3(lum(sourceTone));
  vec3 mixed=vec3(yg)+mix(procChroma,srcChroma,keep);
  return clamp(mixed,0.0,1.24);
}
vec3 softShoulder(vec3 c){return c/(vec3(1.0)+max(c-vec3(.70),vec3(0.0))*.88);}
vec3 sampleBlur12(vec2 uv,vec2 radius){
  vec3 s=texM(uv)*.20;
  s+=texM(uv+radius*vec2(1,0))*.10;s+=texM(uv+radius*vec2(-1,0))*.10;
  s+=texM(uv+radius*vec2(0,1))*.10;s+=texM(uv+radius*vec2(0,-1))*.10;
  s+=texM(uv+radius*vec2(.8,.8))*.10;s+=texM(uv+radius*vec2(-.8,.8))*.10;
  s+=texM(uv+radius*vec2(.8,-.8))*.10;s+=texM(uv+radius*vec2(-.8,-.8))*.10;
  return s;
}
float beam(vec2 uv,vec2 origin,float angle,float width,float falloff){
  vec2 q=rot2(uv-origin,-angle);
  float fwd=smoothstep(-.08,.06,q.x);
  float w=max(.012,width+max(q.x,0.0)*.12);
  float cross=exp(-(q.y*q.y)/(w*w));
  float fade=exp(-max(q.x,0.0)*falloff);
  return fwd*cross*fade;
}
float smokePlume(vec2 uv,vec2 origin,float width,float height,float wind,float phase){
  float rise=(origin.y-uv.y)/max(height,.05);
  float active=smoothstep(-.08,.05,rise)*(1.0-smoothstep(.92,1.34,rise));
  float slow=fbm(vec2(rise*.64,phase*3.7)+11.0)-.5;
  float center=origin.x+wind*rise+sin((rise+phase)*4.4)*width*.13+slow*width*.34;
  float w=width*(.54+max(rise,0.0)*.92);
  float xn=(uv.x-center)/max(w,.015);
  vec2 p=vec2(xn*.72,rise*1.34);
  vec2 warp=vec2(fbm(p*.64+phase*9.0),fbm(p*.68+phase*15.0))-.5;
  p+=warp*.42;
  float macro=fbm(p*.78+phase*17.0);
  float middle=fbm(p*1.48+phase*29.0);
  float billow=smoothstep(.28,.74,macro*.68+middle*.32);
  float envelope=exp(-xn*xn*1.16)*active;
  float crown=smoothstep(.02,.26,rise)*(1.0-smoothstep(.78,1.28,rise));
  return envelope*crown*(.48+.52*billow);
}
float grain(vec2 uv){return hash21(floor(uv*uResolution)+uSeed*17.0)-.5;}
`;

const HALO_FRAG = COMMON + `
void main(){
  vec2 uv=vTexCoord;
  vec3 base=tex(uv);
  float y=lum(base);
  vec2 px=vec2(1.0)/uResolution;

  vec3 graded=filmResponse(base,sat(uColor*1.18));
  graded=sourceColorMix(base,graded);

  float th=mix(.80,.49,uLight);
  float b1=ringBright(uv,mix(2.0,5.5,uH0.y),th);
  float b2=ringBright(uv,mix(8.0,20.0,uH0.z),th-.035);
  float b3=ringBright(uv,mix(24.0,58.0,uH1.w),th-.085);
  float e=edge(uv,2.0/uResolution.x);
  float halo=sat((b1*.74+b2*.95+b3*.88)*(.78+uLight*1.52)+e*uAtmosphere*.34);

  vec3 blurWide=sampleBlur12(uv,px*mix(8.0,24.0,uH0.x));
  float mist=(.06+.18*uAtmosphere)*smoothstep(.02,.82,halo+b3*.8);
  vec3 outc=mix(graded,blurWide,mist);

  vec2 o1=vec2(-.12,mix(.10,.90,uH0.x));
  vec2 o2=vec2(mix(.12,.88,uH1.x),- .10);
  vec2 o3=vec2(1.12,mix(.08,.92,uH2.z));
  float r1=beam(uv,o1,mix(-.30,.32,uH1.z),mix(.025,.090,uH0.w),mix(.45,1.35,uH2.y));
  float r2=beam(uv,o2,mix(.95,1.65,uH2.x),mix(.018,.070,uH1.y),mix(.42,1.18,uH0.z));
  float r3=beam(uv,o3,mix(2.78,3.46,uH2.w),mix(.018,.078,uH1.w),mix(.45,1.28,uH0.y));
  float rayNoise=.72+.28*fbm(uv*2.1+uSeed*.031);
  float rays=sat((r1*.88+r2*.72+r3*.62)*rayNoise*uLight*uAtmosphere);

  vec3 cool=mix(vec3(.56,.80,1.0),vec3(.72,.62,1.0),uH2.x);
  vec3 warm=mix(vec3(1.0,.70,.82),vec3(1.0,.84,.54),uH1.y);
  vec3 haloCol=mix(cool,warm,uH0.w);
  vec3 rayCol=mix(mix(vec3(.72,.92,1.0),vec3(1.0,.66,.86),uH2.z),vec3(1.0,.92,.62),uH2.w*.34);

  outc=screenBlend(outc,haloCol*halo*(.28+1.02*uLight));
  outc=screenBlend(outc,rayCol*rays*(.22+.76*uColor));

  float blow=sat((b1*.05+b2*.13+b3*.19)*uLight*(.92+uAtmosphere*.55));
  outc=mix(outc,vec3(1.0),blow);

  float leakField=smoothstep(.54,.90,fbm(rot2(uv-.5,(uH1.x-.5)*1.4)*mix(.82,1.48,uH0.z)+uSeed*.013));
  leakField*=uAtmosphere*uColor*(.10+.18*uH2.y);
  vec3 leakCol=mix(vec3(.48,.78,1.0),vec3(1.0,.52,.76),uH1.z);
  leakCol=mix(leakCol,vec3(.98,.84,.48),uH2.w*.28);
  outc=screenBlend(outc,leakCol*leakField);

  float g=grain(uv)*(.010+.018*uAtmosphere);
  outc+=vec3(g);
  gl_FragColor=vec4(clamp(outc,0.0,1.0),1.0);
}`;

const VEIL_FRAG = COMMON + `
void main(){
  vec2 uv=vTexCoord;
  vec3 base=tex(uv);
  vec2 px=vec2(1.0)/uResolution;

  vec3 grade0=filmResponse(base,sat(uColor*1.12));
  vec3 lowC=mix(vec3(.68,.88,1.0),vec3(.92,.76,1.0),uH0.w);
  vec3 midC=mix(vec3(.82,.96,1.0),vec3(1.0,.84,.92),uH1.z);
  vec3 hiC=mix(vec3(1.0,.95,.84),vec3(.84,1.0,.94),uH2.y);
  vec3 mapped=paletteMap(grade0,lowC*.72,midC,hiC*1.06,.22+.40*uColor);
  vec3 graded=sourceColorMix(base,mapped);

  vec2 flowUV=rot2(uv-.5,mix(-.82,.82,uH0.x));
  float n0=fbm(flowUV*.55+vec2(uSeed*.010,3.7));
  float n1=fbm(flowUV*1.05+vec2(17.3,uSeed*.009));
  float n2=fbm(flowUV*1.85+vec2(31.9,uSeed*.013));
  float flow=n0*.52+n1*.32+n2*.16;

  float broad=smoothstep(.22,.80,flow);
  float ribbon=pow(sat(.5+.5*sin(flowUV.x*2.4+flow*4.0+uH1.w*6.2831)),mix(2.8,5.8,uH1.x));
  float curtain=pow(sat(.5+.5*sin(flowUV.y*1.5-flow*2.2+uH2.x*6.2831)),2.0);
  float pockets=1.0-smoothstep(.58,.84,fbm(flowUV*1.3+vec2(51.0,uSeed*.011)));

  float membrane=sat((broad*.58+ribbon*.28+curtain*.14)*(.72+.68*uAtmosphere));
  membrane*=mix(.84,1.26,pockets);
  membrane=smoothstep(.16,.92,membrane);

  vec2 disp=vec2(
    noise2(flowUV*3.2+vec2(uSeed,4.1))-.5,
    noise2(flowUV*3.2+vec2(17.0,uSeed))-.5
  )*px*mix(1.0,7.0,uAtmosphere)*membrane;

  vec3 veilScene=texM(uv+disp);
  vec3 blurNear=sampleBlur12(uv+disp,px*mix(2.0,9.0,uH2.z));
  vec3 behind=mix(veilScene,blurNear,membrane*(.12+.26*uAtmosphere));

  float hiBright=bright(uv,mix(.76,.46,uLight));
  float ring=ringBright(uv,mix(6.0,22.0,uH1.y),mix(.74,.50,uLight));
  float e=edge(uv,1.6/uResolution.x);
  float catchLight=sat(hiBright*.72+ring*.82+e*.38);

  vec3 pearlA=mix(vec3(.70,.90,1.0),vec3(1.0,.74,.92),uH0.y);
  vec3 pearlB=mix(vec3(.86,.82,1.0),vec3(.78,1.0,.90),uH2.w);
  vec3 pearlC=mix(vec3(1.0,.92,.70),vec3(.84,.96,1.0),uH1.z);
  float phase=flow*5.4+flowUV.x*1.4-flowUV.y*1.0;
  vec3 pearl=mix(mix(pearlA,pearlB,.5+.5*sin(phase)),pearlC,smoothstep(.45,.85,ring+n2*.25));

  float sheen=membrane*(.10+.26*uLight)+catchLight*membrane*(.22+.62*uLight);
  vec3 outc=mix(graded,behind,membrane*(.10+.22*uAtmosphere));
  outc*=1.0-membrane*(.04+.10*uAtmosphere);
  outc=screenBlend(outc,pearl*sheen);

  float streak=pow(ribbon,2.2)*catchLight*membrane*uAtmosphere;
  outc=screenBlend(outc,mix(vec3(.94,.98,1.0),pearl,.72)*streak*(.16+.40*uLight));

  float milk=membrane*(.035+.090*uAtmosphere)*(1.0-catchLight*.28);
  outc=mix(outc,vec3(1.0),milk);

  float chromaSlip=membrane*catchLight*uColor*(.04+.10*uH0.z);
  vec3 slip=vec3(texM(uv+disp*1.8+px*3.0).r,behind.g,texM(uv-disp*1.5-px*3.0).b);
  outc=mix(outc,slip,chromaSlip);

  outc+=vec3(grain(uv)*(.004+.010*uAtmosphere));
  outc=softShoulder(outc);
  gl_FragColor=vec4(clamp(outc,0.0,1.0),1.0);
}`;


const SMOKE_FRAG = COMMON + `
void main(){
  vec2 uv=vTexCoord;
  vec3 base=tex(uv);
  vec2 px=vec2(1.0)/uResolution;

  vec3 grade0=filmResponse(base,sat(uColor*1.10));
  vec3 lowC=mix(vec3(.60,.72,.90),vec3(.72,.88,.84),uH1.z);
  vec3 midC=mix(vec3(.80,.84,.92),vec3(.92,.84,.76),uH0.w);
  vec3 hiC=mix(vec3(.98,.99,1.0),vec3(.96,.90,.82),uH2.y);
  vec3 mapped=paletteMap(grade0,lowC,midC,hiC,.18+.42*uColor);
  vec3 graded=sourceColorMix(base,mapped);

  vec2 o1=vec2(mix(.06,.22,uH0.y),mix(.84,1.06,uH0.z));
  vec2 o2=vec2(mix(.20,.38,uH1.x),mix(.82,1.04,uH1.y));
  vec2 o3=vec2(mix(.42,.62,uH2.x),mix(.82,1.04,uH2.y));
  vec2 o4=vec2(mix(.64,.84,uH0.x),mix(.84,1.08,uH2.w));
  vec2 o5=vec2(mix(.78,.96,uH1.w),mix(.86,1.08,uH1.z));

  float p1=smokePlume(uv,o1,mix(.16,.34,uH0.x),mix(.82,1.16,uH1.w),mix(-.18,.16,uH1.z),uH0.w);
  float p2=smokePlume(uv,o2,mix(.14,.30,uH2.z),mix(.78,1.10,uH2.w),mix(-.16,.18,uH0.w),uH1.y+.23);
  float p3=smokePlume(uv,o3,mix(.12,.28,uH1.x),mix(.74,1.04,uH0.z),mix(-.14,.20,uH2.x),uH2.z+.51);
  float p4=smokePlume(uv,o4,mix(.10,.24,uH1.y),mix(.68,.98,uH2.y),mix(-.14,.18,uH1.w),uH0.x+.39);
  float p5=smokePlume(uv,o5,mix(.10,.22,uH0.y),mix(.64,.92,uH1.x),mix(-.12,.16,uH2.z),uH1.z+.11);

  float m1=blob(uv,vec2(mix(.16,.34,uH2.x),mix(.52,.76,uH0.z)),vec2(mix(.08,.18,uH0.w),mix(.12,.24,uH1.y)),mix(-.8,.8,uH1.z));
  float m2=blob(uv,vec2(mix(.58,.82,uH1.x),mix(.44,.72,uH2.w)),vec2(mix(.10,.22,uH2.z),mix(.14,.28,uH0.y)),mix(-1.2,1.2,uH0.x));

  float fieldA=fbm(uv*.72+vec2(uSeed*.010,8.4));
  float fieldB=fbm(rot2(uv-.5,mix(-.42,.42,uH1.z))*vec2(.86,1.32)+vec2(19.0,uSeed*.011));
  float fieldC=fbm(uv*2.20+vec2(uSeed*.018,37.0));
  float turbulence=smoothstep(.28,.82,fieldC);

  float core=p1*1.18+p2*1.05+p3*.96+p4*.84+p5*.70;
  core*=.82+.36*fieldA;
  core*=.90+.18*fieldB;
  core+=m1*(.10+.18*uAtmosphere);
  core+=m2*(.08+.16*uAtmosphere);

  float ground=smoothstep(.38,.98,uv.y);
  float lowMist=smoothstep(.24,.84,fbm(vec2(uv.x*.62-uSeed*.010,uv.y*1.40+21.0)));
  lowMist*=ground*(.16+.34*uAtmosphere);

  float canopy=(1.0-smoothstep(.18,.42,uv.y))*smoothstep(.34,.82,fbm(vec2(uv.x*1.10+12.0,uv.y*1.32-uSeed*.009)));
  canopy*=(.06+.18*uAtmosphere);

  float stream1=beam(uv,vec2(-.08,mix(.18,.42,uH0.x)),mix(.24,.66,uH1.y),mix(.06,.16,uH0.z),mix(.30,.82,uH2.x));
  float stream2=beam(uv,vec2(1.08,mix(.20,.46,uH2.y)),mix(2.56,2.98,uH0.w),mix(.06,.15,uH1.w),mix(.34,.88,uH1.x));
  float stream3=beam(uv,vec2(mix(.24,.80,uH2.z),-.10),mix(1.18,1.76,uH2.w),mix(.06,.14,uH0.y),mix(.34,.84,uH1.z));
  float streams=(stream1*.90+stream2*.72+stream3*.54);
  streams*=smoothstep(.20,.88,fbm(uv*1.7+vec2(uSeed*.012,43.0)))*(.10+.24*uAtmosphere);

  float pockets=smoothstep(.62,.88,fbm(rot2(uv-.5,mix(-.54,.54,uH0.w))*vec2(1.2,.9)+vec2(47.0,uSeed*.010)));
  float density=smoothstep(.05,.86,core+lowMist*.56+canopy*.22+streams*.24);
  density*=.86+.18*turbulence;
  density*=1.0-pockets*.18;
  density=sat(density*(.82+.96*uAtmosphere));

  vec2 refr=vec2(
    noise2(uv*4.2+vec2(uSeed,4.1))-.5,
    noise2(uv*4.0+vec2(13.1,uSeed))-.5
  );
  refr*=px*mix(1.2,6.6,uAtmosphere)*(density*.72+lowMist*.34+canopy*.12+streams*.16);

  vec3 warped=texM(uv+refr);
  vec3 blur1=sampleBlur12(uv+refr,px*mix(3.0,9.0,uH1.w));
  vec3 blur2=sampleBlur12(uv+refr*1.5,px*mix(7.0,16.0,uH0.z));
  vec3 behind=mix(warped,blur1,density*(.16+.20*uAtmosphere));
  behind=mix(behind,blur2,lowMist*(.10+.22*uAtmosphere));

  vec3 cool=mix(vec3(.72,.82,.92),vec3(.62,.76,.90),uH1.z);
  vec3 warm=mix(vec3(.94,.92,.86),vec3(.86,.78,.84),uH0.w);
  vec3 chem=mix(vec3(.78,.88,.90),vec3(.80,.76,.92),uH2.z);
  vec3 smokeCol=mix(mix(cool,warm,uH2.y*.44),chem,uColor*(.10+.24*uH0.x));
  smokeCol=mix(smokeCol,vec3(.98,.99,1.0),uLight*.18);

  float hi=bright(uv,mix(.74,.48,uLight));
  float ring=ringBright(uv,mix(8.0,24.0,uH1.y),mix(.72,.50,uLight));
  float ed=edge(uv,1.5/uResolution.x);
  float lightMask=smoothstep(.22,.94,lum(base));
  float backlit=sat((hi*.58+ring*.52+ed*.18)*(density*.68+lowMist*.46+streams*.20));
  backlit*=lightMask*(.30+.90*uLight);

  float opticalDepth=
    density*(.56+1.04*uAtmosphere)+
    lowMist*(.12+.36*uAtmosphere)+
    canopy*(.06+.18*uAtmosphere)+
    streams*(.05+.14*uAtmosphere);
  float trans=exp(-opticalDepth);

  vec3 smoky=behind*trans + smokeCol*(1.0-trans)*(.54+.28*uColor);
  smoky=screenBlend(smoky,mix(smokeCol,vec3(1.0),.54)*backlit*(.18+.38*uLight));

  float wisp=smoothstep(.48,.84,turbulence)*smoothstep(.18,.90,core)*(1.0-trans);
  smoky=screenBlend(smoky,mix(cool,vec3(1.0),.46)*wisp*(.08+.18*uLight));

  float shard=pow(smoothstep(.76,.92,fbm(uv*3.6+vec2(uSeed*.021,61.0))),1.6);
  shard*=(lowMist*.30+density*.20)*(.08+.14*uH0.w);
  smoky=mix(smoky,softLight(smoky,mix(vec3(.86,.92,.98),smokeCol,.34)),shard);

  vec3 outc=mix(graded,smoky,sat(density*.72+lowMist*.28+canopy*.08+streams*.10));
  outc=mix(outc,vec3(1.0),lowMist*.02);
  outc+=vec3(grain(uv)*(.003+.008*uAtmosphere));
  outc=softShoulder(outc);

  gl_FragColor=vec4(clamp(outc,0.0,1.0),1.0);
}`;

const PRISM_FRAG = COMMON + `
void main(){
  vec2 uv=vTexCoord;
  vec3 base=tex(uv);
  vec3 scene=sourceColorMix(base,filmResponse(base,sat(uColor*1.04)));
  vec2 dir=normalize(vec2(cos(uH0.x*6.2831),sin(uH0.x*6.2831)));
  vec2 px=vec2(1.0)/uResolution;
  float spread=mix(3.0,26.0,uLight)*mix(.72,1.46,uH0.y);
  vec2 off=dir*px*spread;

  vec3 cR=texM(uv+off*1.2);
  vec3 cG=texM(uv);
  vec3 cB=texM(uv-off*1.2);
  vec3 chroma=vec3(cR.r,cG.g,cB.b);
  float field=fbm(uv*mix(.78,2.12,uH0.z)+uSeed*.010);
  float phase=dot(uv,dir)*mix(4.2,12.0,uH1.x)+field*2.8;
  float band=pow(.5+.5*sin(phase),mix(4.0,10.0,uH1.y));
  float edgeL=exp(-uv.x*mix(1.6,4.4,uH2.x));
  float edgeR=exp(-(1.0-uv.x)*mix(1.6,4.4,uH2.y));
  float edgeMix=mix(edgeL,edgeR,uH1.z);
  float leak=sat((band*.38+edgeMix*.82)*uAtmosphere);

  vec3 red=vec3(1.0,.14,.07),cyan=vec3(.10,.94,1.0),mag=vec3(1.0,.26,.88),amber=vec3(1.0,.58,.13);
  vec3 leakCol=mix(red,cyan,uH0.w);
  leakCol=mix(leakCol,mag,uH1.y*.62);
  leakCol=mix(leakCol,amber,uH2.z*.28);

  float hi=bright(uv,mix(.72,.50,uLight));
  float e=edge(uv,1.6/uResolution.x);
  float opticalMask=sat(.18+hi*.62+e*.42+leak*.22);
  vec3 outc=mix(scene,chroma,(.10+.28*uColor)*opticalMask);
  outc=screenBlend(outc,leakCol*leak*(.34+.55*uColor));

  float bloom=ringBright(uv,mix(8.0,26.0,uH1.w),mix(.66,.53,uLight))*uLight;
  vec3 spectralBloom=mix(vec3(.92,.96,1.0),leakCol,.30);
  outc=screenBlend(outc,spectralBloom*bloom*(.46+.16*uAtmosphere));

  float wash=smoothstep(.38,.78,field)*uAtmosphere*uColor*.16;
  outc=mix(outc,softLight(outc,leakCol*.78+.12),wash);
  outc+=vec3(grain(uv)*.007);
  outc=softShoulder(outc);
  gl_FragColor=vec4(clamp(outc,0.0,1.0),1.0);
}`;

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
  const rnd=()=>Math.random();
  const r=(a,b)=>a+(b-a)*rnd();
  const seed=rnd()*99.0;
  let h0,h1,h2,count=14;
  if(mode==='HALO'){
    h0=[r(.08,.94),r(.08,.94),r(.08,.92),rnd()];
    h1=[rnd(),rnd(),rnd(),rnd()];
    h2=[rnd(),rnd(),rnd(),rnd()];
    count=16;
  }else if(mode==='VEIL'){
    h0=[rnd(),r(.12,.98),r(.18,.98),rnd()];
    h1=[rnd(),rnd(),rnd(),rnd()];
    h2=[rnd(),rnd(),rnd(),rnd()];
    count=28;
  }else if(mode==='SMOKE'){
    h0=[r(.18,.92),r(.10,.88),r(.24,.96),rnd()];
    h1=[r(.14,.92),r(.18,.96),rnd(),r(.18,.96)];
    h2=[r(.10,.94),r(.10,.94),rnd(),r(.18,.96)];
    count=30;
  }else{
    h0=[rnd(),r(.30,1.0),rnd(),rnd()];
    h1=[r(.30,1.0),rnd(),rnd(),rnd()];
    h2=[rnd(),rnd(),rnd(),rnd()];
    count=16;
  }
  const recipe={seed,h0,h1,h2};
  recipe.id=Math.floor(rnd()*count)+1;
  return recipe;
}

function updateVariation(){if(ui.variationMeta) ui.variationMeta.textContent='CATALOGUE / '+APP.mode+' / '+String(APP.recipe?.id||1).padStart(2,'0');}
function pulseButton(){ui.revealButton.animate([{transform:'translateX(0)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:180,easing:'ease-out'});}

function setUniforms(sh,w,h){
  sh.setUniform('uTex',APP.source);
  sh.setUniform('uResolution',[w,h]);
  sh.setUniform('uLight',APP.params.light/100);
  sh.setUniform('uAtmosphere',APP.params.atmosphere/100);
  sh.setUniform('uColor',APP.params.color/100);
  sh.setUniform('uSourceColor',APP.params.sourceColor/100);
  sh.setUniform('uSeed',APP.recipe.seed);
  sh.setUniform('uH0',APP.recipe.h0);
  sh.setUniform('uH1',APP.recipe.h1);
  sh.setUniform('uH2',APP.recipe.h2);
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
