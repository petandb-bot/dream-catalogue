'use strict';

window.DC_SCRIPT_LOADED = true;

const APP = {
  version: '0.2.7',
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

vec3 spectralColor(float t){
  t=fract(t);
  vec3 rb=.56+.44*cos(6.2831853*(t+vec3(.00,.67,.33)));
  vec3 p01=mix(uC0,uC1,smoothstep(.00,.48,t));
  vec3 p23=mix(uC2,uC3,smoothstep(.52,1.00,t));
  vec3 pal=mix(p01,p23,smoothstep(.28,.72,t));
  float mixAmt=.24+.34*uColor;
  return clamp(mix(pal,rb,mixAmt),0.0,1.18);
}
vec3 spectrumGrade(vec3 base,float amount){
  vec3 c=clamp(base,0.0,1.0);float y=lum(c);
  float sh=1.0-smoothstep(.10,.54,y);float hi=smoothstep(.48,.95,y);float mid=sat(1.0-sh-hi);
  vec3 g0=uC0/max(lum(uC0),.08);vec3 g1=uC1/max(lum(uC1),.08);vec3 g2=uC2/max(lum(uC2),.08);
  vec3 gain=(g0*sh+g1*mid+g2*hi)/max(sh+mid+hi,.001);
  gain=mix(vec3(1.0),gain,.08+.18*uColor);
  float aSh=(uR0.x-.5)*1.30;float aMid=(uR0.y-.5)*1.60;float aHi=(uR0.z-.5)*1.20;
  vec3 q=(hueRotateYIQ(c,aSh)*sh+hueRotateYIQ(c,aMid)*mid+hueRotateYIQ(c,aHi)*hi)/max(sh+mid+hi,.001);
  q*=gain;
  float qy=max(lum(q),.002);q*=max(y,.004)/qy;
  q=satAdjust(q,mix(.88,1.34,uR1.z));
  return mix(base,clamp(q,0.0,1.28),sat(amount));
}
vec3 sourceColorRecovery(vec3 base,vec3 processed){
  float keep=sat(uSourceColor);keep=keep*keep*(3.0-2.0*keep);
  float yp=max(lum(processed),.002),yb=max(lum(base),.018);
  vec3 src=clamp(base*(yp/yb),0.0,1.30);vec3 pc=processed-vec3(yp);vec3 sc=src-vec3(lum(src));
  return clamp(vec3(yp)+mix(pc,sc,keep),0.0,1.30);
}
float beam(vec2 uv,vec2 origin,float angle,float width,float falloff){vec2 q=rot2(uv-origin,-angle);float fwd=smoothstep(-.08,.05,q.x);float w=max(.009,width+max(q.x,0.0)*.085);float cross=exp(-(q.y*q.y)/(w*w));float fade=exp(-max(q.x,0.0)*falloff);return fwd*cross*fade;}
float lineGlow(vec2 uv,vec2 origin,float angle,float width,float falloff){vec2 q=rot2(uv-origin,-angle);float cross=exp(-(q.y*q.y)/max(width*width,.00005));float fade=exp(-abs(q.x)*falloff);return cross*fade;}
float arcGlow(vec2 uv,vec2 center,float radius,float width,float phase){vec2 q=uv-center;float d=abs(length(q)-radius);float ring=exp(-(d*d)/max(width*width,.00003));float ang=atan(q.y,q.x);float gate=.30+.70*smoothstep(.08,.92,.5+.5*sin(ang*2.0+phase));return ring*gate;}
float smokeTrail(vec2 uv,vec2 origin,float width,float height,float wind,float phase){
  float rise=(origin.y-uv.y)/max(height,.06);float active=smoothstep(-.06,.05,rise)*(1.0-smoothstep(.94,1.25,rise));
  float drift=(fbm4(vec2(rise*.92,phase*4.1)+12.0)-.5)*width*.78;
  float center=origin.x+wind*rise+sin(rise*5.2+phase*6.2831)*width*.18+drift;
  float w=width*(.42+max(rise,0.0)*.94)*(.80+.22*sin(rise*7.0+phase*4.0));
  float xn=(uv.x-center)/max(abs(w),.016);vec2 p=vec2(xn*.60,rise*1.10);
  float macro=fbm4(p*.86+phase*19.0);float inner=fbm4(p*1.58+phase*31.0);
  float body=exp(-xn*xn*1.20)*active;float billow=smoothstep(.22,.78,macro*.66+inner*.34);return body*(.34+.66*billow);
}
`;

const HALO_FRAG = HALO_COMMON + `
void main(){
  vec2 uv=vTexCoord;vec3 base=tex(uv);vec2 px=vec2(1.0)/uResolution;
  vec3 graded=sourceColorRecovery(base,spectrumGrade(base,.34+.30*uColor));
  float th=mix(.82,.47,uLight);float b1=bright(uv,th);float b2=ringBright(uv,mix(8.0,24.0,uH0.z),th-.06);float b3=ringBright(uv,mix(26.0,62.0,uH1.w),th-.10);
  float e=edge(uv,1.8/uResolution.x);float halo=sat(b1*.58+b2*.94+b3*.90+e*.20*uAtmosphere);
  vec3 blur=sampleBlur9(uv,px*mix(9.0,25.0,uH0.x));vec3 outc=mix(graded,blur,halo*(.06+.20*uAtmosphere));

  float side=step(.5,uR0.x);vec2 src=vec2(mix(-.14,1.14,side),mix(.08,.78,uR0.y));vec2 aim=vec2(.5,.48)-src;float a=atan(aim.y,aim.x);
  float spread=mix(.08,.34,uR1.x);float rw=mix(.010,.034,uH0.w);
  float r0=beam(uv,src,a-spread,rw*.72,mix(.34,.84,uR1.y));
  float r1=beam(uv,src,a-spread*.45,rw,mix(.30,.78,uR1.z));
  float r2=beam(uv,src,a,rw*1.24,mix(.28,.72,uH1.x));
  float r3=beam(uv,src,a+spread*.52,rw*.88,mix(.34,.88,uH2.y));
  float r4=beam(uv,src,a+spread,rw*.62,mix(.40,.96,uH2.w));
  float noise=.64+.36*fbm4(uv*2.1+vec2(uSeed*.031,9.0));
  float rayAmt=uLight*uAtmosphere*(.55+.65*uR2.x)*noise;
  outc=screenBlend(outc,spectralColor(.03+uR0.z)*r0*rayAmt*.46);
  outc=screenBlend(outc,spectralColor(.23+uR1.y)*r1*rayAmt*.58);
  outc=screenBlend(outc,spectralColor(.46+uR2.y)*r2*rayAmt*.72);
  outc=screenBlend(outc,spectralColor(.69+uR0.w)*r3*rayAmt*.54);
  outc=screenBlend(outc,spectralColor(.88+uR2.z)*r4*rayAmt*.40);

  vec2 axis=vec2(.5)-src;float flareGate=.52+.48*step(.28,uR2.w);
  float f1=blob(uv,src+axis*.34,vec2(.045,.032)*(1.0+uR1.x),a)*flareGate;
  float f2=blob(uv,src+axis*.62,vec2(.070,.045)*(1.0+uR0.z),a)*flareGate;
  float f3=blob(uv,src+axis*1.08,vec2(.11,.055)*(1.0+uH2.z),a)*flareGate;
  outc=screenBlend(outc,spectralColor(.18+uR2.x)*f1*(.10+.24*uLight));
  outc=screenBlend(outc,spectralColor(.55+uR1.w)*f2*(.08+.20*uLight));
  outc=screenBlend(outc,spectralColor(.82+uR0.y)*f3*(.06+.16*uLight));

  float arc=arcGlow(uv,src,mix(.30,.78,uH1.y),mix(.008,.022,uR2.z),uSeed*.11+uR1.x*6.2831);
  arc*=uAtmosphere*(.10+.30*uLight)*(.45+.55*step(.38,uR2.y));outc=screenBlend(outc,spectralColor(.35+uR2.w)*arc);

  float burn=blob(uv,src,vec2(mix(.28,.56,uH2.x),mix(.20,.48,uH1.z)),a)*(.18+.42*uLight);
  burn*=smoothstep(.20,.92,fbm4((uv-src)*1.4+uSeed*.013));outc=screenBlend(outc,spectralColor(.70+uR1.z)*burn*.24);
  float blow=sat((b1*.08+b2*.15+b3*.18)*uLight*(.95+uAtmosphere*.55));outc=mix(outc,vec3(1.0),blow);
  outc+=vec3(grain(uv)*(.007+.014*uAtmosphere));outc=softShoulder(outc);gl_FragColor=vec4(clamp(outc,0.0,1.0),1.0);
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
float ellipseField(vec2 uv,vec2 c,vec2 sz,float a){vec2 q=rot2(uv-c,a)/max(sz,vec2(.001));return exp(-dot(q,q)*2.20);}
float edge(vec2 uv,float px){vec2 dx=vec2(px,0),dy=vec2(0,px);float ex=abs(lum(texM(uv+dx))-lum(texM(uv-dx)));float ey=abs(lum(texM(uv+dy))-lum(texM(uv-dy)));return sat((ex+ey)*2.10);}
float bright(vec2 uv,float t){float y=lum(texM(uv));return smoothstep(t-.06,t+.08,y)*sat((y-t+.09)/(1.08-t));}
vec3 screenBlend(vec3 a,vec3 b){return 1.0-(1.0-a)*(1.0-b);}
vec3 softShoulder(vec3 c){return c/(vec3(1.0)+max(c-vec3(.72),vec3(0.0))*.88);}
float grain(vec2 uv){return hash21(floor(uv*uResolution)+uSeed*17.0)-.5;}
vec3 satAdjust(vec3 c,float a){float y=lum(c);return mix(vec3(y),c,a);}
vec3 hueRotateYIQ(vec3 c,float a){float Y=dot(c,vec3(.299,.587,.114));float I=dot(c,vec3(.596,-.274,-.322));float Q=dot(c,vec3(.211,-.523,.312));float cs=cos(a),sn=sin(a);float I2=I*cs-Q*sn;float Q2=I*sn+Q*cs;return vec3(Y+.956*I2+.621*Q2,Y-.272*I2-.647*Q2,Y-1.106*I2+1.703*Q2);}
vec3 spectralColor(float t){t=fract(t);vec3 rb=.54+.46*cos(6.2831853*(t+vec3(.00,.67,.33)));vec3 a=mix(uC0,uC1,smoothstep(.00,.48,t));vec3 b=mix(uC2,uC3,smoothstep(.52,1.00,t));vec3 pal=mix(a,b,smoothstep(.28,.72,t));return clamp(mix(pal,rb,.36+.34*uColor),0.0,1.24);}
vec3 prismGrade(vec3 base){float y=lum(base);vec3 q=base;float sh=1.0-smoothstep(.10,.56,y),hi=smoothstep(.48,.94,y),mid=sat(1.0-sh-hi);q=(hueRotateYIQ(q,(uR0.x-.5)*.72)*sh+hueRotateYIQ(q,(uR0.y-.5)*1.05)*mid+hueRotateYIQ(q,(uR0.z-.5)*.82)*hi)/max(sh+mid+hi,.001);q=satAdjust(q,.96+.30*uColor);return clamp(q,0.0,1.18);}
vec3 sourceColorRecovery(vec3 base,vec3 processed){float keep=sat(uSourceColor);keep=keep*keep*(3.0-2.0*keep);float yp=max(lum(processed),.002),yb=max(lum(base),.018);vec3 src=clamp(base*(yp/yb),0.0,1.30);vec3 pc=processed-vec3(yp);vec3 sc=src-vec3(lum(src));return clamp(vec3(yp)+mix(pc,sc,keep),0.0,1.30);}
float beam(vec2 uv,vec2 origin,float angle,float width,float falloff){vec2 q=rot2(uv-origin,-angle);float fwd=smoothstep(-.08,.05,q.x);float w=max(.007,width+max(q.x,0.0)*.074);return fwd*exp(-(q.y*q.y)/(w*w))*exp(-max(q.x,0.0)*falloff);}
float arcGlow(vec2 uv,vec2 center,float radius,float width,float phase){vec2 q=uv-center;float d=abs(length(q)-radius);float ring=exp(-(d*d)/max(width*width,.00002));float ang=atan(q.y,q.x);float gate=.18+.82*smoothstep(.12,.90,.5+.5*sin(ang*2.4+phase));return ring*gate;}
`;

const PRISM_FRAG = PRISM_COMMON + `
void main(){
  vec2 uv=vTexCoord;vec2 px=vec2(1.0)/uResolution;vec3 base=texM(uv);
  vec3 scene=sourceColorRecovery(base,prismGrade(base));

  float a0=uH0.x*6.2831853;float a1=a0+mix(.62,1.42,uR2.x);float a2=a0-mix(.48,1.18,uR1.w);
  vec2 d0=vec2(cos(a0),sin(a0));vec2 d1=vec2(cos(a1),sin(a1));vec2 d2=vec2(cos(a2),sin(a2));
  vec2 c0=vec2(mix(.12,.88,uR0.x),mix(.12,.88,uR0.y));
  vec2 c1=vec2(mix(.10,.90,uR1.x),mix(.10,.90,uR1.y));
  vec2 c2=vec2(mix(.12,.88,uR2.y),mix(.12,.88,uR2.z));
  float z0=ellipseField(uv,c0,vec2(mix(.20,.48,uH0.y),mix(.08,.24,uH0.z)),a0);
  float z1=ellipseField(uv,c1,vec2(mix(.16,.40,uH1.x),mix(.09,.28,uH1.y)),a1);
  float z2=ellipseField(uv,c2,vec2(mix(.14,.34,uH2.x),mix(.08,.23,uH2.y)),a2);
  float fracture=sat(z0*.94+z1*.82+z2*.72);

  float n0=fbm4(rot2(uv-.5,a0)*2.2+vec2(uSeed*.013,7.0));
  float n1=fbm4(rot2(uv-.5,a1)*3.1+vec2(19.0,uSeed*.017));
  vec2 flow=vec2(n0-.5,n1-.5);
  float spread=mix(9.0,52.0,uLight)*(.82+.72*uAtmosphere);
  vec2 off0=(d0*(.52+z0)+d1*z1*.44+flow*.34)*px*spread;
  vec2 off1=(d1*(.48+z1)+d2*z2*.46-flow*.28)*px*spread;
  vec2 off2=(d2*(.54+z2)-d0*z0*.34+flow*.22)*px*spread;

  vec3 refrA=vec3(texM(uv+off0*1.65).r,texM(uv-off1*.32).g,texM(uv-off2*1.58).b);
  vec3 refrB=vec3(texM(uv-off1*1.38).r,texM(uv+off2*.22).g,texM(uv+off0*1.44).b);
  float flip=smoothstep(.40,.72,fbm4(uv*1.28+vec2(33.0,uSeed*.01)));
  vec3 refr=mix(refrA,refrB,flip*z1*.68);
  vec3 ghost=texM(uv+(d0*z0-d1*z1+d2*z2)*px*spread*2.1);
  float local=sat(fracture*(.70+.52*uAtmosphere)+edge(uv,1.5/uResolution.x)*.36+bright(uv,mix(.77,.46,uLight))*.44);
  vec3 outc=mix(scene,refr,local*(.34+.46*uColor));
  outc=mix(outc,ghost,sat((z0*z1+z1*z2+z0*z2)*(.08+.18*uAtmosphere)));

  float plane0=pow(ridge(.5+.5*sin(dot(uv,d1)*mix(18.0,36.0,uH1.z)+n0*5.6+uSeed*.17)),10.0);
  float plane1=pow(ridge(.5+.5*sin(dot(uv,d2)*mix(28.0,56.0,uH2.z)-n1*6.2+uSeed*.11)),13.0);
  float diffraction=sat((plane0*.72+plane1*.58)*fracture*(.56+.72*uAtmosphere));
  vec3 spec=spectralColor(dot(uv,d0)*2.4+n0*.66+uR0.w);
  outc=screenBlend(outc,spec*diffraction*(.24+.48*uColor));

  float ca0=pow(ridge(fbm4(rot2(uv-c0,a1)*3.0+uSeed*.021)),7.0)*z0;
  float ca1=pow(ridge(fbm4(rot2(uv-c1,a2)*3.8+17.0+uSeed*.018)),8.0)*z1;
  outc=screenBlend(outc,spectralColor(.22+n0+uR1.z)*ca0*(.16+.34*uLight));
  outc=screenBlend(outc,spectralColor(.62+n1+uR2.w)*ca1*(.12+.30*uLight));

  float side=step(.5,uR2.w);vec2 src=vec2(mix(-.12,1.12,side),mix(.08,.84,uH2.w));vec2 aim=vec2(.5)-src;float ba=atan(aim.y,aim.x);float bs=mix(.10,.30,uR0.z);
  float br0=beam(uv,src,ba-bs,mix(.007,.020,uH0.w),mix(.34,.80,uR0.y));
  float br1=beam(uv,src,ba,mix(.010,.026,uH1.w),mix(.30,.70,uR1.z));
  float br2=beam(uv,src,ba+bs,mix(.006,.018,uH2.w),mix(.40,.90,uR2.x));
  float rayGate=uLight*uAtmosphere*(.48+.64*uR2.y);
  outc=screenBlend(outc,spectralColor(.06+uR0.x)*br0*rayGate*.42);
  outc=screenBlend(outc,spectralColor(.42+uR1.x)*br1*rayGate*.52);
  outc=screenBlend(outc,spectralColor(.78+uR2.z)*br2*rayGate*.36);

  float arc0=arcGlow(uv,c0,mix(.16,.54,uH2.x),mix(.005,.015,uR1.x),uSeed*.14);
  float arc1=arcGlow(uv,c2,mix(.12,.46,uH1.w),mix(.004,.013,uR2.y),uSeed*.19+2.1);
  outc=screenBlend(outc,spectralColor(.35+uR0.y)*arc0*z0*(.14+.28*uLight));
  outc=screenBlend(outc,spectralColor(.68+uR1.y)*arc1*z2*(.12+.24*uLight));

  outc+=vec3(grain(uv)*.006);outc=softShoulder(outc);gl_FragColor=vec4(clamp(outc,0.0,1.0),1.0);
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
  vec3 sigma=mix(vec3(.96,1.03,1.12),vec3(1.10,.98,.90),.5+.5*sin(phase*6.2831853));
  sigma=mix(sigma,vec3(1.0),.44+.42*uSourceColor);
  vec3 trans=exp(-sigma*(density*(.78+1.16*uAtmosphere)+floorFog*.28));
  float transY=dot(trans,vec3(.333333));

  vec3 neutral=mix(vec3(.78,.81,.84),vec3(.92,.92,.89),uR0.y);
  float ambientScatter=(1.0-transY)*(.24+.22*uAtmosphere);
  vec3 smoky=behind*trans+neutral*ambientScatter;

  float hi=bright(uv,mix(.77,.46,uLight));float e=edge(uv,1.35/uResolution.x);
  float rim=sat((hi*.76+e*.18)*density)*(.34+.96*uLight);
  vec3 rimCol=mix(vec3(.94,.96,1.0),spectralColor(.16+phase*.38+uR1.w),.18+.22*uColor);
  smoky+=rimCol*rim*(.18+.34*uLight);

  float side=step(.5,uR2.z);vec2 src=vec2(mix(-.12,1.12,side),mix(.10,.76,uR2.w));vec2 aim=vec2(.50,.48)-src;float a=atan(aim.y,aim.x);float spread=mix(.10,.30,uR1.x);
  float br0=beam(uv,src,a-spread,mix(.010,.026,uH0.w),mix(.30,.72,uR0.x));
  float br1=beam(uv,src,a,mix(.014,.034,uH1.y),mix(.26,.66,uR1.y));
  float br2=beam(uv,src,a+spread,mix(.009,.024,uH2.w),mix(.34,.78,uR1.z));
  float smokeGate=sat(density*.94+floorFog*.42);float rayAmt=uLight*uAtmosphere*smokeGate*(.46+.70*uR2.x);
  vec3 rayColor0=spectralColor(.05+uR0.x);vec3 rayColor1=spectralColor(.43+uR1.x);vec3 rayColor2=spectralColor(.80+uR2.y);
  smoky+=rayColor0*br0*rayAmt*.26+rayColor1*br1*rayAmt*.34+rayColor2*br2*rayAmt*.22;

  float filament=pow(ridge(inner),8.0)*density*smoothstep(.30,.84,curl);vec3 filCol=mix(vec3(.94,.96,.98),spectralColor(.30+inner+uR1.w),.22+.22*uColor);
  smoky+=filCol*filament*(.08+.20*uLight);
  float shadowPocket=(1.0-smoothstep(.28,.70,curl))*density*uAtmosphere*(.05+.08*uR0.w);smoky*=1.0-shadowPocket;

  float mixMask=sat(density*(.82+.26*uAtmosphere)+floorFog*.22);vec3 outc=mix(graded,smoky,mixMask);
  outc+=vec3(grain(uv)*(.003+.007*uAtmosphere));outc=softShoulder(outc);gl_FragColor=vec4(clamp(outc,0.0,1.0),1.0);
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
  float membrane=sat((broad*.70+fold0*.28+fold1*.22+fold2*.16)*(.72+1.02*uAtmosphere));

  vec2 flow=vec2(noise2(p*3.0+vec2(uSeed,4.1))-.5,noise2(p*2.8+vec2(17.0,uSeed))-.5);
  flow+=vec2(fold0-fold1,fold2-fold0)*.24;
  vec2 disp=flow*px*mix(2.0,13.0,uAtmosphere)*membrane;
  vec3 refr=texM(uv+disp);vec3 blur=sampleBlur5(uv+disp,px*mix(2.0,9.0,uH2.z));
  vec3 behind=mix(refr,blur,membrane*(.10+.22*uAtmosphere));

  float phase=fract(broad*1.72+n1*.86+fold0*.28-fold1*.21+uR2.z);
  vec3 gain=interferenceGain(phase,.18+.54*uColor*membrane);
  vec3 film=behind*gain;float fy=max(lum(film),.002),by=max(lum(behind),.002);film*=mix(1.0,by/fy,.62);
  vec3 outc=mix(graded,film,membrane*(.36+.34*uAtmosphere));

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
  outc+=pearl*pearly*(.08+.24*uLight);

  float arc0=arcGlow(uv,lensC0,mix(.14,.48,uH1.w),mix(.005,.018,uR1.z),uSeed*.13);
  float arc1=arcGlow(uv,lensC1,mix(.10,.40,uH2.w),mix(.004,.014,uR2.x),uSeed*.17+2.0);
  outc+=spectralColor(.44+phase)*arc0*membrane*(.08+.20*uLight);
  outc+=spectralColor(.72+phase)*arc1*membrane*(.06+.16*uLight);

  float milk=membrane*(.018+.060*uAtmosphere)*(1.0-hi*.48);outc=mix(outc,vec3(1.0),milk);
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
  if(mode==='HALO'){h0=[r(.08,.94),r(.08,.94),r(.08,.92),rnd()];h1=[rnd(),rnd(),rnd(),rnd()];h2=[rnd(),rnd(),rnd(),rnd()];count=34;}
  else if(mode==='VEIL'){h0=[rnd(),r(.18,.98),r(.24,.98),rnd()];h1=[r(.10,.98),r(.12,.98),rnd(),r(.12,.98)];h2=[r(.10,.98),r(.10,.98),rnd(),r(.14,.98)];count=42;}
  else if(mode==='SMOKE'){h0=[r(.16,.94),r(.08,.94),r(.22,.98),rnd()];h1=[r(.16,.96),r(.20,.98),rnd(),r(.22,.98)];h2=[r(.14,.96),r(.14,.96),rnd(),r(.18,.98)];count=40;}
  else{h0=[rnd(),r(.52,1.0),r(.18,.98),rnd()];h1=[r(.52,1.0),r(.20,.98),rnd(),r(.18,.98)];h2=[r(.18,.98),r(.18,.98),rnd(),r(.18,.98)];count=48;}
  return {seed,h0,h1,h2,r0:[rnd(),rnd(),rnd(),rnd()],r1:[rnd(),rnd(),rnd(),rnd()],r2:[rnd(),rnd(),rnd(),rnd()],c0:s.c0,c1:s.c1,c2:s.c2,c3:s.c3,spectrum:s.name,id:Math.floor(rnd()*count)+1};
}

function updateVariation(){if(ui.variationMeta) ui.variationMeta.textContent='CATALOGUE / '+APP.mode+' / '+String(APP.recipe?.id||1).padStart(2,'0')+' / '+(APP.recipe?.spectrum||'—');}
function pulseButton(){ui.revealButton.animate([{transform:'translateX(0)'},{transform:'translateX(5px)'},{transform:'translateX(0)'}],{duration:180,easing:'ease-out'});}

function setUniforms(sh,w,h){
  sh.setUniform('uTex',APP.source);sh.setUniform('uResolution',[w,h]);
  sh.setUniform('uLight',APP.params.light/100);sh.setUniform('uAtmosphere',APP.params.atmosphere/100);sh.setUniform('uColor',APP.params.color/100);sh.setUniform('uSourceColor',APP.params.sourceColor/100);
  sh.setUniform('uSeed',APP.recipe.seed);sh.setUniform('uH0',APP.recipe.h0);sh.setUniform('uH1',APP.recipe.h1);sh.setUniform('uH2',APP.recipe.h2);
  sh.setUniform('uR0',APP.recipe.r0);sh.setUniform('uR1',APP.recipe.r1);sh.setUniform('uR2',APP.recipe.r2);sh.setUniform('uC0',APP.recipe.c0);sh.setUniform('uC1',APP.recipe.c1);sh.setUniform('uC2',APP.recipe.c2);sh.setUniform('uC3',APP.recipe.c3);
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
