// 물속 일렁임: 배경 층(먼 물·산맥·숲 벽·중간 바위)을 느린 물결로 조금씩 밀어 물 너머를 보는 느낌을 준다.
// 생물·소품에는 쓰지 않는다. 텍셀 단위로 밀고 최근접으로 읽으므로 픽셀 격자는 그대로다.
precision highp float;
uniform sampler2D uMap;
uniform vec4 uSun;
uniform float uAmp;
in vec2 vUv;
in vec4 vColor;
out vec4 fragColor;
void main() {
  vec2 dims = vec2(textureSize(uMap, 0));
  vec2 p = vUv * dims;
  float t = uSun.w;
  // 줄마다 옆으로(두 물결을 겹쳐 규칙이 덜 보이게), 열마다 위아래로 조금 민다.
  float dx = sin(p.y * 0.16 + t * 0.9) * 0.65 + sin(p.y * 0.057 - t * 0.55 + p.x * 0.012) * 0.35;
  float dy = sin(p.x * 0.11 + t * 0.7 + p.y * 0.02) * 0.5 + sin(p.x * 0.043 - t * 0.45) * 0.5;
  vec2 q = p + vec2(dx, dy * 0.5) * uAmp;
  ivec2 texel = ivec2(clamp(floor(q), vec2(0.0), dims - vec2(1.0)));
  fragColor = vColor * texelFetch(uMap, texel, 0);
}
