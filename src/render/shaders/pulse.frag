// 둥글게 퍼지는 고리 모양 일렁임(유리 두드림).
precision highp float;
uniform sampler2D uSource;
uniform vec2 uDims;
uniform vec4 uCenterRadiusAspect;
uniform vec4 uDirectionProgressIntensity;
uniform vec4 uBandOffsetEdgeDesaturation;
out vec4 fragColor;

vec4 sampleScene(vec2 uv) {
  vec2 c = clamp(uv, vec2(0.001), vec2(0.999));
  return texture(uSource, vec2(c.x, 1.0 - c.y));
}

vec2 normalizeOrZero(vec2 v) {
  float l = length(v);
  return l < 0.0001 ? vec2(0.0) : v / l;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uDims.y - gl_FragCoord.y);
  vec2 uv = frag / max(uDims, vec2(1.0));
  vec2 centerUv = uCenterRadiusAspect.xy;
  float radiusUv = uCenterRadiusAspect.z;
  float aspect = uCenterRadiusAspect.w;
  float progress = uDirectionProgressIntensity.z;
  float intensity = uDirectionProgressIntensity.w;
  float bandWidth = uBandOffsetEdgeDesaturation.x;
  float offsetStrength = uBandOffsetEdgeDesaturation.y;
  vec2 delta = uv - centerUv;
  vec2 aspectDelta = vec2(delta.x * aspect, delta.y);
  float distanceFromCenter = length(aspectDelta);
  float radius = radiusUv * progress;
  float ring = smoothstep(radius - bandWidth, radius, distanceFromCenter) * (1.0 - step(radius, distanceFromCenter));
  vec2 offset = normalizeOrZero(delta) * ring * intensity * offsetStrength;
  fragColor = sampleScene(uv - offset);
}
