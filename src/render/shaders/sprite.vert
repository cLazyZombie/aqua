// 월드 sprite 정점: 창 논리 좌표(y 아래가 +)를 NDC로 바꾼다.
precision highp float;
in vec2 position;
in vec2 uv;
in vec4 color;
uniform vec2 uViewport;
out vec2 vUv;
out vec4 vColor;
void main() {
  vUv = uv;
  vColor = color;
  vec2 ndc = position / uViewport * 2.0 - 1.0;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
}
