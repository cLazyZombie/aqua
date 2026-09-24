// Sprite2dMaterial::Solid: 정점 색 그대로.
precision highp float;
in vec2 vUv;
in vec4 vColor;
out vec4 fragColor;
void main() {
  fragColor = vColor;
}
