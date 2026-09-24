// Sprite2dMaterial::Texture: 정점 색 × texture(최근접).
precision highp float;
uniform sampler2D uMap;
in vec2 vUv;
in vec4 vColor;
out vec4 fragColor;
void main() {
  fragColor = vColor * texture(uMap, vUv);
}
