// 생물 노멀맵 조명. 정점 색 R/G는 가장 가까운 발광원 방향, B는 세기, A는 불투명도다.
// uSun.xy: 해 방향(화면 좌표, y 아래 +, 길이가 1을 넘는 만큼 황금빛 아침), uSun.z: 햇빛 세기, uSun.w: 시간.
precision highp float;
uniform sampler2D uMap;
uniform sampler2D uNormal;
uniform vec4 uSun;
uniform float uPixel;
uniform vec2 uScreen;
// 희귀 색 변이: 0 보통, 1 황금, 2 알비노, 3 흑색.
uniform int uVariant;
in vec2 vUv;
in vec4 vColor;
out vec4 fragColor;

float caustic(vec2 world, float time) {
  vec2 q = world * 0.075;
  float a = sin(q.x + sin(q.y * 1.3 + time * 0.9) * 1.4 + time * 0.6);
  float b = sin(q.y * 1.1 + sin(q.x * 0.8 - time * 0.7) * 1.4 - time * 0.5);
  float line = abs(a + b);
  return pow(clamp(1.0 - line * 1.6, 0.0, 1.0), 3.0);
}

// 명도를 유지한 채 색만 바꾼다. 어두운 외곽선은 그대로 둬 윤곽이 무너지지 않게 한다.
vec3 variantColor(vec3 c) {
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  if (uVariant == 1) {
    vec3 low = vec3(0.2, 0.11, 0.03);
    vec3 mid = vec3(0.8, 0.52, 0.1);
    vec3 high = vec3(1.0, 0.94, 0.6);
    return lum < 0.4 ? mix(low, mid, lum / 0.4) : mix(mid, high, (lum - 0.4) / 0.6);
  }
  if (uVariant == 2) {
    return lum < 0.16 ? c : mix(vec3(0.93, 0.74, 0.78), vec3(1.0, 0.98, 0.96), clamp((lum - 0.16) / 0.7, 0.0, 1.0));
  }
  if (uVariant == 3) {
    return mix(vec3(0.05, 0.06, 0.1), vec3(0.34, 0.4, 0.54), lum);
  }
  return c;
}

void main() {
  bool mirrored = dFdx(vUv.x) < 0.0;
  vec2 dims = vec2(textureSize(uMap, 0));
  ivec2 texel = ivec2(clamp(floor(vUv * dims), vec2(0.0), dims - vec2(1.0)));
  vec4 albedo = texelFetch(uMap, texel, 0);
  albedo.rgb = variantColor(albedo.rgb);
  vec3 normal = texelFetch(uNormal, texel, 0).xyz * 2.0 - vec3(1.0);
  if (mirrored) {
    normal.x = -normal.x;
  }
  normal = normalize(normal);
  float sunStrength = uSun.z;
  vec3 sunDir = normalize(vec3(uSun.xy, 0.9));
  float lambert = max(dot(normal, sunDir), 0.0);
  float banded = floor(lambert * 3.0 + 0.5) / 3.0;
  float diffuse = mix(lambert, banded, 0.65);
  float rim = pow(1.0 - clamp(normal.z, 0.0, 1.0), 1.6) * max(dot(normalize(normal.xy + vec2(0.0001, 0.0)), normalize(sunDir.xy)), 0.0);
  vec3 ambient = mix(vec3(0.52, 0.62, 0.82), vec3(0.74, 0.8, 0.86), sunStrength);
  vec3 light = ambient + vec3(1.0, 0.96, 0.86) * diffuse * 0.42 * sunStrength;
  vec3 pointDir = normalize(vec3(vColor.r * 2.0 - 1.0, vColor.g * 2.0 - 1.0, 0.55));
  float pointStrength = vColor.b;
  float pointLight = max(dot(normal, pointDir), 0.0) * pointStrength;
  light = light + vec3(0.3, 0.95, 1.0) * pointLight * 1.3;
  // wgpu 프래그먼트 좌표는 왼쪽 위가 원점이다.
  vec2 frag = vec2(gl_FragCoord.x, uScreen.y - gl_FragCoord.y);
  vec2 worldPixel = floor(frag / uPixel);
  float facingUp = clamp(-normal.y * 0.8 + 0.35, 0.0, 1.0);
  float caustics = caustic(worldPixel, uSun.w) * facingUp * sunStrength;
  float golden = clamp(length(uSun.xy) - 1.0, 0.0, 1.0);
  vec3 rimColor = mix(vec3(1.0, 0.97, 0.85), vec3(1.0, 0.78, 0.3), golden);
  vec3 rgb = albedo.rgb * light;
  rgb = rgb + rimColor * rim * (0.38 + 0.5 * golden) * sunStrength;
  rgb = rgb + vec3(0.75, 1.0, 0.95) * caustics * 0.22;
  rgb = rgb + vec3(0.3, 0.95, 1.0) * pow(1.0 - clamp(normal.z, 0.0, 1.0), 2.0) * pointStrength * 0.5;
  fragColor = vec4(rgb, albedo.a * vColor.a);
}
