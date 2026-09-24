// 몸 모양 덧칠: 정점 색을 texture 알파 모양으로 칠한다(교감 색 변화·발광 덧칠).
precision highp float;
uniform sampler2D uMap;
in vec2 vUv;
in vec4 vColor;
out vec4 fragColor;
void main() {
  vec2 dims = vec2(textureSize(uMap, 0));
  ivec2 texel = ivec2(clamp(floor(vUv * dims), vec2(0.0), dims - vec2(1.0)));
  float shape = texelFetch(uMap, texel, 0).a;
  fragColor = vec4(vColor.rgb, vColor.a * shape);
}
