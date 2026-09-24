// HDR bloom source. 색에 알파와 layer 강도를 곱해 1.0을 넘는 값을 만든다.
// uMask가 켜지면(uUseMask=1) texture alpha 모양으로만 빛난다(fs_alpha_mask).
precision highp float;
uniform sampler2D uMask;
uniform float uUseMask;
uniform float uIntensity;
in vec2 vUv;
in vec4 vColor;
out vec4 fragColor;
void main() {
  float maskAlpha = uUseMask > 0.5 ? texture(uMask, vUv).a : 1.0;
  float a = vColor.a * maskAlpha;
  fragColor = vec4(vColor.rgb * a * uIntensity, a);
}
