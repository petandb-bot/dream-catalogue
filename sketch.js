'use strict';

window.DC_SCRIPT_LOADED = true;

const APP = {
  version: '0.2.8.2',
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

const HALO_COMMON = `
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


const HALO_FRAG = HALO_COMMON + `
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


const PRISM_COMMON = `
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

vec3 prismSpectrum(float t){
  t=fract(t);
  return clamp(.54+.46*cos(6.2831853*(t+vec3(.00,.67,.33))),0.0,1.0);
}
float prismArc(vec2 uv,vec2 center,float radius,float width,float phase){
  vec2 q=uv-center;
  float d=abs(length(q)-radius);
  float ring=exp(-(d*d)/max(width*width,.000025));
  float ang=atan(q.y,q.x);
  float gate=.18+.82*smoothstep(.12,.92,.5+.5*sin(ang*2.25+phase));
  return ring*gate;
}
`;


const PRISM_FRAG = PRISM_COMMON + `
void main(){
  vec2 uv=vTexCoord;
  vec3 base=tex(uv);
  vec2 px=vec2(1.0)/uResolution;

  vec3 scene=filmResponse(base,sat(uColor*1.12));
  scene=sourceColorMix(base,scene);

  // Three soft optical volumes: no hard polygon masks.
  float a0=mix(-2.65,2.65,uH0.x);
  float a1=a0+mix(.62,1.46,uH1.x);
  float a2=a0-mix(.54,1.24,uH2.x);
  vec2 d0=vec2(cos(a0),sin(a0));
  vec2 d1=vec2(cos(a1),sin(a1));
  vec2 d2=vec2(cos(a2),sin(a2));

  vec2 c0=vec2(mix(.08,.92,uH0.y),mix(.10,.90,uH1.y));
  vec2 c1=vec2(mix(.08,.92,uH2.y),mix(.12,.88,uH0.w));
  vec2 c2=vec2(mix(.10,.90,uH1.z),mix(.10,.90,uH2.w));
  float z0=blob(uv,c0,vec2(mix(.18,.42,uH0.z),mix(.11,.30,uH1.w)),a0);
  float z1=blob(uv,c1,vec2(mix(.15,.36,uH1.x),mix(.10,.27,uH2.z)),a1);
  float z2=blob(uv,c2,vec2(mix(.14,.32,uH2.x),mix(.09,.24,uH0.y)),a2);
  float zone=sat(z0*.92+z1*.84+z2*.76);

  float n0=fbm(rot2(uv-.5,a0)*1.72+vec2(uSeed*.013,7.0));
  float n1=fbm(rot2(uv-.5,a1)*2.16+vec2(17.0,uSeed*.017));
  vec2 flow=vec2(noise2(uv*2.8+vec2(uSeed,3.0))-.5,noise2(uv*2.6+vec2(11.0,uSeed))-.5);

  float spread=mix(6.0,46.0,uLight)*(.86+.74*uAtmosphere);
  vec2 v0=(d0*(.56+.80*z0)+flow*.34)*px*spread;
  vec2 v1=(d1*(.50+.78*z1)-flow*.26)*px*spread;
  vec2 v2=(d2*(.46+.74*z2)+flow*.20)*px*spread;

  vec3 refr0=vec3(texM(uv+v0*1.62).r,texM(uv+v0*.18).g,texM(uv-v0*1.42).b);
  vec3 refr1=vec3(texM(uv-v1*1.36).r,texM(uv+v1*.14).g,texM(uv+v1*1.54).b);
  vec3 refr2=vec3(texM(uv+v2*1.46).r,texM(uv-v2*.10).g,texM(uv-v2*1.58).b);
  float sum=max(z0+z1+z2,.001);
  vec3 refr=(refr0*z0+refr1*z1+refr2*z2)/sum;
  refr=mix(scene,refr,sat(sum));

  float e=edge(uv,1.6/uResolution.x);
  float hi=bright(uv,mix(.75,.44,uLight));
  float opticalMask=sat(zone*(.82+.42*uAtmosphere)+e*.28+hi*.36);
  vec3 outc=mix(scene,refr,opticalMask*(.36+.46*uColor+.19*uLight));

  // Diffraction sheets cross the refracted zones at two scales.
  vec2 q0=rot2(uv-.5,a0);
  vec2 q1=rot2(uv-.5,a1);
  float band0=pow(sat(.5+.5*sin(q0.x*mix(18.0,38.0,uH1.z)+n0*6.0+uSeed*.17)),9.0);
  float band1=pow(sat(.5+.5*sin((q1.x*.72+q1.y*.34)*mix(28.0,58.0,uH2.z)-n1*6.5+uSeed*.11)),12.0);
  float dif0=band0*smoothstep(.08,.82,z0+z1*.55)*uAtmosphere;
  float dif1=band1*smoothstep(.08,.82,z1+z2*.62)*uAtmosphere;
  outc=screenBlend(outc,prismSpectrum(q0.x*1.9+n0*.42+uH0.w)*dif0*(.16+.42*uColor));
  outc=screenBlend(outc,prismSpectrum(q1.y*2.3+n1*.48+uH1.w)*dif1*(.12+.36*uColor));

  // Caustic light behaves like bent glass, not an overlay wash.
  float ca0=pow(ridge(fbm(rot2(uv-c0,a1)*3.0+uSeed*.021)),7.0)*z0;
  float ca1=pow(ridge(fbm(rot2(uv-c1,a2)*3.7+17.0+uSeed*.018)),8.0)*z1;
  float ca2=pow(ridge(fbm(rot2(uv-c2,a0)*4.2+31.0+uSeed*.015)),9.0)*z2;
  outc=screenBlend(outc,prismSpectrum(.12+n0+uH2.y)*ca0*(.17+.40*uLight));
  outc=screenBlend(outc,prismSpectrum(.48+n1+uH0.z)*ca1*(.14+.36*uLight));
  outc=screenBlend(outc,prismSpectrum(.78+n0-n1+uH1.y)*ca2*(.12+.32*uLight));

  // Large spectral rays give each REVEAL a clear optical event.
  float side=step(.5,uH2.z);
  vec2 src=vec2(mix(-.12,1.12,side),mix(.08,.86,uH0.x));
  vec2 aim=vec2(.50,.48)-src;
  float ba=atan(aim.y,aim.x);
  float bs=mix(.09,.29,uH1.x);
  float br0=beam(uv,src,ba-bs,mix(.010,.030,uH0.w),mix(.34,.82,uH2.y));
  float br1=beam(uv,src,ba,mix(.014,.040,uH1.y),mix(.28,.72,uH0.z));
  float br2=beam(uv,src,ba+bs,mix(.009,.026,uH2.w),mix(.38,.90,uH1.z));
  float rayNoise=.68+.32*fbm(uv*1.9+vec2(uSeed*.027,9.0));
  float rayGate=uLight*uAtmosphere*(.64+.48*zone)*rayNoise;
  outc=screenBlend(outc,prismSpectrum(.04+uH0.x)*br0*rayGate*.48);
  outc=screenBlend(outc,prismSpectrum(.39+uH1.x)*br1*rayGate*.62);
  outc=screenBlend(outc,prismSpectrum(.76+uH2.x)*br2*rayGate*.45);

  // Curved lens arcs and highlight bloom retain a photographic source.
  float arc0=prismArc(uv,c0,mix(.16,.52,uH2.x),mix(.005,.016,uH1.w),uSeed*.13);
  float arc1=prismArc(uv,c2,mix(.14,.46,uH1.y),mix(.004,.014,uH0.w),uSeed*.19+2.0);
  outc=screenBlend(outc,prismSpectrum(.26+uH0.y)*arc0*z0*(.12+.30*uLight));
  outc=screenBlend(outc,prismSpectrum(.64+uH2.y)*arc1*z2*(.10+.26*uLight));

  float rb1=ringBright(uv,mix(7.0,19.0,uH1.w),mix(.70,.47,uLight));
  float rb2=ringBright(uv,mix(20.0,48.0,uH0.z),mix(.66,.43,uLight));
  float bloom=sat((rb1*.72+rb2*.66+hi*.40)*uLight);
  outc=screenBlend(outc,prismSpectrum(.18+n0*.30)*bloom*(.20+.26*uAtmosphere));
  float blow=sat((hi*.08+rb1*.08+rb2*.11)*uLight*(.70+.55*uAtmosphere));
  outc=mix(outc,vec3(1.0),blow*.40);

  outc+=vec3(grain(uv)*(.006+.006*uAtmosphere));
  gl_FragColor=vec4(clamp(outc,0.0,1.0),1.0);
}
`;


const SMOKE_COMMON = `
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
uniform vec4 uR2;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;

float sat(float x){return clamp(x,0.0,1.0);}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec2 mirrorUV(vec2 uv){vec2 q=mod(uv,2.0);return 1.0-abs(q-1.0);}
vec3 texM(vec2 uv){return texture2D(uTex,mirrorUV(uv)).rgb;}
float hash21(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);float a=hash21(i),b=hash21(i+vec2(1,0)),c=hash21(i+vec2(0,1)),d=hash21(i+vec2(1,1));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
float fbm4(vec2 p){float v=0.0,a=.52;mat2 m=mat2(1.57,1.11,-1.11,1.57);for(int i=0;i<4;i++){v+=a*noise2(p);p=m*p+13.71;a*=.48;}return v;}
float ridge(float x){return 1.0-abs(2.0*x-1.0);}
vec2 rot2(vec2 p,float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c)*p;}
float blob(vec2 uv,vec2 c,vec2 size,float a){vec2 q=rot2(uv-c,a)/max(size,vec2(.001));return exp(-dot(q,q)*2.05);}
float edge(vec2 uv,float px){vec2 dx=vec2(px,0),dy=vec2(0,px);float ex=abs(lum(texM(uv+dx))-lum(texM(uv-dx)));float ey=abs(lum(texM(uv+dy))-lum(texM(uv-dy)));return sat((ex+ey)*1.92);}
float bright(vec2 uv,float t){float y=lum(texM(uv));return smoothstep(t-.06,t+.08,y)*sat((y-t+.09)/(1.08-t));}
vec3 sampleBlur5(vec2 uv,vec2 r){vec3 s=texM(uv)*.36;s+=texM(uv+r*vec2(1,0))*.16;s+=texM(uv-r*vec2(1,0))*.16;s+=texM(uv+r*vec2(0,1))*.16;s+=texM(uv-r*vec2(0,1))*.16;return s;}
vec3 softShoulder(vec3 c){return c/(vec3(1.0)+max(c-vec3(.72),vec3(0.0))*.90);}
float grain(vec2 uv){return hash21(floor(uv*uResolution)+uSeed*17.0)-.5;}
vec3 spectralColor(float t){t=fract(t);vec3 rb=.56+.44*cos(6.2831853*(t+vec3(.00,.67,.33)));vec3 a=mix(uC0,uC1,smoothstep(.00,.48,t));vec3 b=mix(uC2,uC3,smoothstep(.52,1.00,t));vec3 pal=mix(a,b,smoothstep(.28,.72,t));return clamp(mix(pal,rb,.18+.22*uColor),0.0,1.12);}
vec3 sourceColorRecovery(vec3 base,vec3 processed){float keep=sat(uSourceColor);keep=keep*keep*(3.0-2.0*keep);float yp=max(lum(processed),.002),yb=max(lum(base),.018);vec3 src=clamp(base*(yp/yb),0.0,1.30);vec3 pc=processed-vec3(yp);vec3 sc=src-vec3(lum(src));return clamp(vec3(yp)+mix(pc,sc,keep),0.0,1.30);}
vec3 smokeGrade(vec3 base){float y=lum(base);vec3 cool=vec3(.92,.97,1.04),warm=vec3(1.03,.99,.94);vec3 gain=mix(cool,warm,uR0.y);vec3 q=base*mix(vec3(1.0),gain,.05+.11*uColor);float yy=max(lum(q),.002);q*=max(y,.004)/yy;return sourceColorRecovery(base,q);}
float smokeTrail(vec2 uv,vec2 origin,float width,float height,float wind,float phase){float rise=(origin.y-uv.y)/max(height,.06);float active=smoothstep(-.08,.04,rise)*(1.0-smoothstep(.96,1.28,rise));float drift=(fbm4(vec2(rise*.88,phase*4.1)+12.0)-.5)*width*.92;float curl=sin(rise*6.0+phase*6.2831+fbm4(vec2(rise*1.4,phase*8.0))*2.2);float center=origin.x+wind*rise+curl*width*.22+drift;float w=width*(.38+max(rise,0.0)*1.02)*(.82+.18*sin(rise*8.0+phase*3.0));float xn=(uv.x-center)/max(abs(w),.014);vec2 p=vec2(xn*.62,rise*1.12);float macro=fbm4(p*.82+phase*19.0);float inner=fbm4(p*1.66+phase*31.0);float body=exp(-xn*xn*1.18)*active;float billow=smoothstep(.20,.78,macro*.62+inner*.38);return body*(.28+.72*billow);}
float beam(vec2 uv,vec2 origin,float angle,float width,float falloff){vec2 q=rot2(uv-origin,-angle);float fwd=smoothstep(-.08,.05,q.x);float w=max(.010,width+max(q.x,0.0)*.10);return fwd*exp(-(q.y*q.y)/(w*w))*exp(-max(q.x,0.0)*falloff);}
`;

const SMOKE_FRAG = SMOKE_COMMON + `
void main(){
  vec2 uv=vTexCoord;vec2 px=vec2(1.0)/uResolution;vec3 base=texM(uv);vec3 graded=smokeGrade(base);

  vec2 o0=vec2(mix(.00,.24,uH0.y),mix(.88,1.10,uH0.z));
  vec2 o1=vec2(mix(.18,.46,uH1.x),mix(.84,1.08,uH1.y));
  vec2 o2=vec2(mix(.48,.78,uH2.x),mix(.86,1.10,uH2.y));
  vec2 o3=vec2(mix(.72,.98,uR0.z),mix(.88,1.12,uR1.x));
  float t0=smokeTrail(uv,o0,mix(.10,.25,uH0.x),mix(.78,1.18,uH1.w),mix(-.26,.18,uH1.z),uH0.w);
  float t1=smokeTrail(uv,o1,mix(.10,.23,uH2.z),mix(.74,1.12,uH2.w),mix(-.22,.22,uH0.w),uH1.y+.31);
  float t2=smokeTrail(uv,o2,mix(.09,.21,uH1.x),mix(.70,1.08,uH0.z),mix(-.20,.20,uH2.x),uH2.z+.63);
  float t3=smokeTrail(uv,o3,mix(.07,.17,uR0.y),mix(.62,.96,uR1.z),mix(-.16,.16,uR0.x),uR1.y+.17);
  float macro=fbm4(uv*.64+vec2(uSeed*.010,7.4));float inner=fbm4(uv*1.92+vec2(uSeed*.018,31.7));
  float curl=fbm4(rot2(uv-.5,(uR2.x-.5)*1.4)*vec2(.92,1.58)+vec2(22.0,uSeed*.014));
  float raw=(t0*1.12+t1*.98+t2*.86+t3*.62)*(.76+.40*macro);
  float hollow=smoothstep(.62,.88,fbm4(uv*1.18+vec2(44.0,uSeed*.012)));raw*=1.0-hollow*.42;
  float floorFog=blob(uv,vec2(mix(.16,.84,uR1.x),mix(.84,1.00,uR1.y)),vec2(mix(.24,.58,uR0.z),mix(.06,.14,uR1.z)),mix(-.30,.30,uR0.y));
  floorFog*=smoothstep(.28,.80,curl)*(.08+.22*uAtmosphere);
  float density=sat(smoothstep(.035,.74,raw+floorFog*.36)*(.70+1.12*uAtmosphere));
  density*=.84+.22*inner;

  vec2 refr=vec2(noise2(uv*4.2+vec2(uSeed,4.1))-.5,noise2(uv*4.0+vec2(13.1,uSeed))-.5);
  refr*=px*mix(1.2,7.6,uAtmosphere)*(density+floorFog*.44);
  vec3 warped=texM(uv+refr);vec3 blur=sampleBlur5(uv+refr,px*mix(3.0,11.0,uH1.w));
  vec3 behind=mix(warped,blur,density*(.12+.26*uAtmosphere));

  float phase=fract(inner*.72+curl*.44+uR2.y);
  vec3 sigma=mix(vec3(1.00,1.025,1.055),vec3(1.045,1.01,.985),.5+.5*sin(phase*6.2831853));
  sigma=mix(sigma,vec3(1.0),.44+.42*uSourceColor);
  vec3 trans=exp(-sigma*(density*(.78+1.16*uAtmosphere)+floorFog*.28));
  float transY=dot(trans,vec3(.333333));

  vec3 neutral=mix(vec3(.94,.955,.98),vec3(1.00,.985,.955),uR0.y);
  float ambientScatter=(1.0-transY)*(.34+.30*uAtmosphere);
  vec3 smoky=behind*trans+neutral*ambientScatter;
  float whiteCore=pow(density,1.42)*(.045+.105*uAtmosphere);
  smoky=mix(smoky,vec3(1.0,.995,.985),whiteCore);

  float hi=bright(uv,mix(.77,.46,uLight));float e=edge(uv,1.35/uResolution.x);
  float rim=sat((hi*.76+e*.18)*density)*(.34+.96*uLight);
  vec3 rimCol=mix(vec3(.985,.992,1.0),spectralColor(.16+phase*.38+uR1.w),.10+.16*uColor);
  smoky+=rimCol*rim*(.18+.34*uLight);

  float side=step(.5,uR2.z);vec2 src=vec2(mix(-.12,1.12,side),mix(.10,.76,uR2.w));vec2 aim=vec2(.50,.48)-src;float a=atan(aim.y,aim.x);float spread=mix(.10,.30,uR1.x);
  float br0=beam(uv,src,a-spread,mix(.010,.026,uH0.w),mix(.30,.72,uR0.x));
  float br1=beam(uv,src,a,mix(.014,.034,uH1.y),mix(.26,.66,uR1.y));
  float br2=beam(uv,src,a+spread,mix(.009,.024,uH2.w),mix(.34,.78,uR1.z));
  float smokeGate=sat(density*.94+floorFog*.42);float rayAmt=uLight*uAtmosphere*smokeGate*(.46+.70*uR2.x);
  vec3 rayColor0=mix(vec3(1.0,.985,.97),spectralColor(.05+uR0.x),.38+.18*uColor);vec3 rayColor1=mix(vec3(.97,.99,1.0),spectralColor(.43+uR1.x),.38+.18*uColor);vec3 rayColor2=mix(vec3(.99,.98,1.0),spectralColor(.80+uR2.y),.38+.18*uColor);
  smoky+=rayColor0*br0*rayAmt*.26+rayColor1*br1*rayAmt*.34+rayColor2*br2*rayAmt*.22;

  float filament=pow(ridge(inner),8.0)*density*smoothstep(.30,.84,curl);vec3 filCol=mix(vec3(.985,.992,1.0),spectralColor(.30+inner+uR1.w),.12+.16*uColor);
  smoky+=filCol*filament*(.08+.20*uLight);
  float shadowPocket=(1.0-smoothstep(.28,.70,curl))*density*uAtmosphere*(.025+.045*uR0.w);smoky*=1.0-shadowPocket;

  float mixMask=sat(density*(.82+.26*uAtmosphere)+floorFog*.22);vec3 outc=mix(graded,smoky,mixMask);
  outc+=vec3(grain(uv)*(.003+.007*uAtmosphere));outc=mix(outc,softShoulder(outc),.46);gl_FragColor=vec4(clamp(outc,0.0,1.0),1.0);
}
`;

const VEIL_COMMON = `
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
uniform vec4 uR2;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;

float sat(float x){return clamp(x,0.0,1.0);}
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec2 mirrorUV(vec2 uv){vec2 q=mod(uv,2.0);return 1.0-abs(q-1.0);}
vec3 texM(vec2 uv){return texture2D(uTex,mirrorUV(uv)).rgb;}
float hash21(vec2 p){p=fract(p*vec2(123.34,345.45));p+=dot(p,p+34.345);return fract(p.x*p.y);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);float a=hash21(i),b=hash21(i+vec2(1,0)),c=hash21(i+vec2(0,1)),d=hash21(i+vec2(1,1));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}
float fbm4(vec2 p){float v=0.0,a=.52;mat2 m=mat2(1.57,1.11,-1.11,1.57);for(int i=0;i<4;i++){v+=a*noise2(p);p=m*p+13.71;a*=.48;}return v;}
float ridge(float x){return 1.0-abs(2.0*x-1.0);}
vec2 rot2(vec2 p,float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c)*p;}
float blob(vec2 uv,vec2 c,vec2 size,float a){vec2 q=rot2(uv-c,a)/max(size,vec2(.001));return exp(-dot(q,q)*2.10);}
float edge(vec2 uv,float px){vec2 dx=vec2(px,0),dy=vec2(0,px);float ex=abs(lum(texM(uv+dx))-lum(texM(uv-dx)));float ey=abs(lum(texM(uv+dy))-lum(texM(uv-dy)));return sat((ex+ey)*2.0);}
float bright(vec2 uv,float t){float y=lum(texM(uv));return smoothstep(t-.06,t+.08,y)*sat((y-t+.09)/(1.08-t));}
vec3 sampleBlur5(vec2 uv,vec2 r){vec3 s=texM(uv)*.36;s+=texM(uv+r*vec2(1,0))*.16;s+=texM(uv-r*vec2(1,0))*.16;s+=texM(uv+r*vec2(0,1))*.16;s+=texM(uv-r*vec2(0,1))*.16;return s;}
vec3 softShoulder(vec3 c){return c/(vec3(1.0)+max(c-vec3(.72),vec3(0.0))*.90);}
float grain(vec2 uv){return hash21(floor(uv*uResolution)+uSeed*17.0)-.5;}
vec3 spectralColor(float t){t=fract(t);vec3 rb=.56+.44*cos(6.2831853*(t+vec3(.00,.67,.33)));vec3 a=mix(uC0,uC1,smoothstep(.00,.48,t));vec3 b=mix(uC2,uC3,smoothstep(.52,1.00,t));vec3 pal=mix(a,b,smoothstep(.28,.72,t));return clamp(mix(pal,rb,.28+.32*uColor),0.0,1.18);}
vec3 sourceColorRecovery(vec3 base,vec3 processed){float keep=sat(uSourceColor);keep=keep*keep*(3.0-2.0*keep);float yp=max(lum(processed),.002),yb=max(lum(base),.018);vec3 src=clamp(base*(yp/yb),0.0,1.30);vec3 pc=processed-vec3(yp);vec3 sc=src-vec3(lum(src));return clamp(vec3(yp)+mix(pc,sc,keep),0.0,1.30);}
vec3 veilGrade(vec3 base){float y=lum(base);vec3 gain=mix(vec3(.97,1.00,1.04),vec3(1.03,.98,1.00),uR0.y);vec3 q=base*mix(vec3(1.0),gain,.04+.10*uColor);float yy=max(lum(q),.002);q*=max(y,.004)/yy;return sourceColorRecovery(base,q);}
vec3 interferenceGain(float phase,float amount){vec3 w=.5+.5*cos(6.2831853*(phase+vec3(.00,.33,.67)));float m=max(dot(w,vec3(.333333)),.08);vec3 g=w/m;return clamp(mix(vec3(1.0),g,sat(amount)),vec3(.50),vec3(1.72));}
float arcGlow(vec2 uv,vec2 center,float radius,float width,float phase){vec2 q=uv-center;float d=abs(length(q)-radius);float ring=exp(-(d*d)/max(width*width,.00003));float ang=atan(q.y,q.x);return ring*(.22+.78*smoothstep(.08,.92,.5+.5*sin(ang*2.2+phase)));}
`;

const VEIL_FRAG = VEIL_COMMON + `
void main(){
  vec2 uv=vTexCoord;vec2 px=vec2(1.0)/uResolution;vec3 base=texM(uv);vec3 graded=veilGrade(base);
  float ang=mix(-1.05,1.05,uH0.x);vec2 p=rot2(uv-.5,ang);
  float n0=fbm4(p*.50+vec2(uSeed*.010,3.7));float n1=fbm4(p*1.06+vec2(17.3,uSeed*.009));float n2=fbm4(p*2.12+vec2(31.9,uSeed*.013));
  float broad=smoothstep(.18,.78,n0*.58+n1*.30+n2*.12);
  float holes=smoothstep(.60,.88,fbm4(p*1.30+vec2(51.0,uSeed*.011)));broad*=1.0-holes*.50;
  float fold0=pow(ridge(.5+.5*sin(p.x*mix(4.0,8.0,uR0.x)+n0*5.2+uR0.y*6.2831)),8.0);
  float fold1=pow(ridge(.5+.5*sin((p.x*.54+p.y)*mix(7.0,14.0,uR1.x)-n1*4.1+uR1.y*6.2831)),10.0);
  float fold2=pow(ridge(.5+.5*sin((p.x*.30-p.y*.84)*mix(10.0,20.0,uR2.x)+n2*3.4+uR2.y*6.2831)),12.0);
  float membrane=sat((broad*.70+fold0*.28+fold1*.22+fold2*.16)*(.78+1.10*uAtmosphere));

  vec2 flow=vec2(noise2(p*3.0+vec2(uSeed,4.1))-.5,noise2(p*2.8+vec2(17.0,uSeed))-.5);
  flow+=vec2(fold0-fold1,fold2-fold0)*.24;
  vec2 disp=flow*px*mix(2.0,13.0,uAtmosphere)*membrane;
  vec3 refr=texM(uv+disp);vec3 blur=sampleBlur5(uv+disp,px*mix(2.0,9.0,uH2.z));
  vec3 behind=mix(refr,blur,membrane*(.10+.22*uAtmosphere));

  float phase=fract(broad*1.72+n1*.86+fold0*.28-fold1*.21+uR2.z);
  vec3 gain=interferenceGain(phase,.18+.54*uColor*membrane);
  vec3 film=behind*gain;float fy=max(lum(film),.002),by=max(lum(behind),.002);film*=mix(1.0,by/fy,.62);
  vec3 outc=mix(graded,film,membrane*(.40+.38*uAtmosphere));

  vec2 lensC0=vec2(mix(.12,.88,uR0.w),mix(.14,.86,uR1.w));vec2 lensC1=vec2(mix(.10,.90,uR2.w),mix(.12,.88,uH2.w));
  float lens0=blob(uv,lensC0,vec2(mix(.10,.26,uH1.x),mix(.08,.22,uH1.y)),ang*.7);
  float lens1=blob(uv,lensC1,vec2(mix(.08,.22,uH2.x),mix(.06,.18,uH2.y)),-ang*.8);
  vec2 ldisp0=(uv-lensC0)*(.035+.055*uAtmosphere)*lens0;vec2 ldisp1=(uv-lensC1)*(.028+.050*uAtmosphere)*lens1;
  vec3 liquid0=texM(uv-ldisp0+disp*.5);vec3 liquid1=texM(uv+ldisp1-disp*.35);
  outc=mix(outc,liquid0,lens0*(.20+.22*uAtmosphere));outc=mix(outc,liquid1,lens1*(.16+.20*uAtmosphere));

  float crease=sat(fold0*.52+fold1*.42+fold2*.34)*membrane;vec3 creaseGain=interferenceGain(fract(phase+.21+n2*.42),.34+.40*uColor);
  outc=mix(outc,outc*creaseGain,crease*(.28+.34*uLight));
  float hi=bright(uv,mix(.78,.46,uLight));float e=edge(uv,1.4/uResolution.x);
  float pearly=sat((hi*.72+e*.24)*(fold0*.46+fold1*.36+lens0*.28+lens1*.22))*membrane;
  vec3 pearl=mix(vec3(.98,.99,1.0),spectralColor(.18+phase+uR1.z),.28+.28*uColor);
  outc+=pearl*pearly*(.10+.28*uLight);

  float arc0=arcGlow(uv,lensC0,mix(.14,.48,uH1.w),mix(.005,.018,uR1.z),uSeed*.13);
  float arc1=arcGlow(uv,lensC1,mix(.10,.40,uH2.w),mix(.004,.014,uR2.x),uSeed*.17+2.0);
  outc+=spectralColor(.44+phase)*arc0*membrane*(.10+.23*uLight);
  outc+=spectralColor(.72+phase)*arc1*membrane*(.075+.19*uLight);

  float milk=membrane*(.026+.078*uAtmosphere)*(1.0-hi*.48);outc=mix(outc,vec3(1.0),milk);
  outc+=vec3(grain(uv)*(.003+.007*uAtmosphere));outc=softShoulder(outc);gl_FragColor=vec4(clamp(outc,0.0,1.0),1.0);
}
`;

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
  else if(mode==='VEIL'){h0=[rnd(),r(.18,.98),r(.24,.98),rnd()];h1=[r(.10,.98),r(.12,.98),rnd(),r(.12,.98)];h2=[r(.10,.98),r(.10,.98),rnd(),r(.14,.98)];count=42;}
  else if(mode==='SMOKE'){h0=[r(.16,.94),r(.08,.94),r(.22,.98),rnd()];h1=[r(.16,.96),r(.20,.98),rnd(),r(.22,.98)];h2=[r(.14,.96),r(.14,.96),rnd(),r(.18,.98)];count=40;}
  else{h0=[rnd(),r(.52,1.0),r(.18,.98),rnd()];h1=[r(.52,1.0),r(.20,.98),rnd(),r(.18,.98)];h2=[r(.18,.98),r(.18,.98),rnd(),r(.18,.98)];count=48;}
  return {seed,h0,h1,h2,r0:[rnd(),rnd(),rnd(),rnd()],r1:[rnd(),rnd(),rnd(),rnd()],r2:[rnd(),rnd(),rnd(),rnd()],c0:s.c0,c1:s.c1,c2:s.c2,c3:s.c3,spectrum:s.name,id:Math.floor(rnd()*count)+1};
}

function updateVariation(){if(ui.variationMeta) ui.variationMeta.textContent='CATALOGUE / '+APP.mode+' / '+String(APP.recipe?.id||1).padStart(2,'0')+' / '+(APP.recipe?.spectrum||'—');}
function pulseButton(){ui.revealButton.animate([{transform:'translateX(0)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:180,easing:'ease-out'});}

function setUniforms(sh,w,h,mode=APP.mode){
  sh.setUniform('uTex',APP.source);sh.setUniform('uResolution',[w,h]);
  sh.setUniform('uLight',APP.params.light/100);sh.setUniform('uAtmosphere',APP.params.atmosphere/100);sh.setUniform('uColor',APP.params.color/100);sh.setUniform('uSourceColor',APP.params.sourceColor/100);
  sh.setUniform('uSeed',APP.recipe.seed);sh.setUniform('uH0',APP.recipe.h0);sh.setUniform('uH1',APP.recipe.h1);sh.setUniform('uH2',APP.recipe.h2);
  if(mode==='SMOKE'||mode==='VEIL'){
    sh.setUniform('uR0',APP.recipe.r0);sh.setUniform('uR1',APP.recipe.r1);sh.setUniform('uR2',APP.recipe.r2);
    sh.setUniform('uC0',APP.recipe.c0);sh.setUniform('uC1',APP.recipe.c1);sh.setUniform('uC2',APP.recipe.c2);sh.setUniform('uC3',APP.recipe.c3);
  }
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
    g.shader(sh);setUniforms(sh,outW,outH,APP.mode);g.clear();g.plane(outW,outH,1,1);g.resetShader();
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
