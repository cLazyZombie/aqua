// 수중 픽셀 후처리: 월드 픽셀 재양자화, 수면 띠 줄 흔들림, 톤 분리, 채도, 팔레트, CRT.
// 필드 해석(center=월드 영역 왼쪽 위 UV, direction=월드 영역 UV 크기, progress=시간,
// intensity=줄 흔들림 진폭, radius=팔레트 세기, aspect=CRT, band=톤 분리, offset=색수차, edge=그레인, desaturation=채도 가산).
// 팔레트는 aqua의 scripts/build_palette.py 결과를 옮긴 것이다(scripts/sync_palette.py로 다시 만든다).
precision highp float;
uniform sampler2D uSource;
uniform vec2 uDims;
uniform vec4 uCenterRadiusAspect;
uniform vec4 uDirectionProgressIntensity;
uniform vec4 uBandOffsetEdgeDesaturation;
out vec4 fragColor;

const vec2 WORLD_SIZE = vec2(480.0, 270.0);
// PALETTE_BEGIN (scripts/build_palette.py가 생성)
const int PALETTE_SIZE = 119;
const vec3 PALETTE[119] = vec3[119](
  vec3(0.0000, 0.0000, 0.0000),
  vec3(0.0000, 0.0000, 0.2510),
  vec3(0.0235, 0.0392, 0.1098),
  vec3(0.2078, 0.0039, 0.1020),
  vec3(0.0039, 0.0157, 0.5961),
  vec3(0.0000, 0.0078, 0.8941),
  vec3(0.2000, 0.0000, 0.5216),
  vec3(0.0039, 0.2000, 0.1922),
  vec3(0.2353, 0.0745, 0.2941),
  vec3(0.3765, 0.0667, 0.0000),
  vec3(0.1608, 0.1882, 0.0588),
  vec3(0.5725, 0.0000, 0.0000),
  vec3(0.0039, 0.2392, 0.3922),
  vec3(0.0824, 0.1451, 0.7176),
  vec3(0.6196, 0.0000, 0.2000),
  vec3(0.7725, 0.0000, 0.0000),
  vec3(0.0000, 0.2039, 1.0000),
  vec3(0.0275, 0.4078, 0.0627),
  vec3(0.4471, 0.1569, 0.3294),
  vec3(0.6196, 0.0510, 0.4510),
  vec3(0.1569, 0.3294, 0.2392),
  vec3(0.2000, 0.1843, 0.8902),
  vec3(0.1922, 0.2667, 0.5882),
  vec3(0.0000, 0.3490, 0.7333),
  vec3(0.4235, 0.1647, 0.6118),
  vec3(0.2275, 0.3843, 0.0353),
  vec3(0.6627, 0.0000, 0.9725),
  vec3(0.4706, 0.2627, 0.1412),
  vec3(0.9922, 0.0431, 0.0196),
  vec3(0.8275, 0.1137, 0.1922),
  vec3(0.9765, 0.0235, 0.3686),
  vec3(0.5020, 0.1922, 0.8314),
  vec3(0.3569, 0.3765, 0.3490),
  vec3(0.7412, 0.2549, 0.0000),
  vec3(0.1059, 0.5882, 0.0275),
  vec3(0.1020, 0.4980, 0.5059),
  vec3(0.5255, 0.3098, 0.4196),
  vec3(0.2745, 0.3373, 1.0000),
  vec3(0.4157, 0.4706, 0.0039),
  vec3(0.0000, 0.4980, 1.0000),
  vec3(0.1961, 0.5804, 0.2510),
  vec3(0.8118, 0.2314, 0.4667),
  vec3(0.1137, 0.5255, 0.8000),
  vec3(0.6196, 0.4235, 0.0392),
  vec3(0.3608, 0.4314, 0.7059),
  vec3(0.6706, 0.3647, 0.2824),
  vec3(0.9804, 0.2667, 0.0000),
  vec3(0.6980, 0.2588, 0.7882),
  vec3(0.9020, 0.2745, 0.2353),
  vec3(0.6314, 0.3451, 0.5882),
  vec3(0.0039, 0.6824, 0.6706),
  vec3(0.2627, 0.7137, 0.0039),
  vec3(0.0000, 0.6824, 0.8745),
  vec3(1.0000, 0.3020, 0.2314),
  vec3(0.8392, 0.4157, 0.1373),
  vec3(0.3451, 0.6039, 0.4824),
  vec3(0.2431, 0.5569, 1.0000),
  vec3(0.4549, 0.4549, 0.9961),
  vec3(0.8431, 0.2745, 1.0000),
  vec3(0.1176, 0.7569, 0.5216),
  vec3(0.5765, 0.5647, 0.3255),
  vec3(1.0000, 0.2824, 0.6824),
  vec3(0.4902, 0.7020, 0.0275),
  vec3(0.0863, 0.8863, 0.1725),
  vec3(0.9922, 0.3765, 0.4235),
  vec3(0.6941, 0.6118, 0.0000),
  vec3(0.7451, 0.5059, 0.4196),
  vec3(0.2627, 0.6863, 0.7804),
  vec3(0.4549, 0.6078, 0.7843),
  vec3(0.4314, 0.7255, 0.2588),
  vec3(0.5922, 0.5882, 0.5765),
  vec3(1.0000, 0.4980, 0.0000),
  vec3(0.8118, 0.4784, 0.6196),
  vec3(0.6667, 0.5216, 0.8353),
  vec3(0.7843, 0.5922, 0.2392),
  vec3(0.7529, 0.4627, 1.0000),
  vec3(0.0118, 0.8471, 0.9961),
  vec3(0.3216, 0.8353, 0.3804),
  vec3(0.6275, 0.7333, 0.1608),
  vec3(0.0235, 0.9451, 0.6667),
  vec3(0.2196, 0.7843, 1.0000),
  vec3(0.4353, 0.7686, 0.5804),
  vec3(1.0000, 0.4706, 0.6667),
  vec3(0.8784, 0.6745, 0.0000),
  vec3(0.3137, 0.7843, 1.0000),
  vec3(0.4510, 0.7176, 1.0000),
  vec3(0.9686, 0.5843, 0.4118),
  vec3(1.0000, 0.5882, 0.3529),
  vec3(0.9961, 0.5255, 0.7843),
  vec3(0.3804, 0.8471, 0.8510),
  vec3(0.1961, 0.9451, 0.8549),
  vec3(0.5922, 0.7647, 0.7608),
  vec3(0.7176, 0.8471, 0.0275),
  vec3(0.9451, 0.5725, 0.9804),
  vec3(0.7373, 0.8039, 0.3529),
  vec3(0.7843, 0.7373, 0.5843),
  vec3(1.0000, 0.7137, 0.1882),
  vec3(0.6118, 0.8471, 0.5843),
  vec3(0.5686, 1.0000, 0.0118),
  vec3(0.4392, 0.9569, 0.6784),
  vec3(0.5333, 0.9608, 0.4196),
  vec3(0.9294, 0.8745, 0.0000),
  vec3(0.7020, 0.8078, 1.0000),
  vec3(1.0000, 0.7176, 0.6941),
  vec3(0.3725, 1.0000, 1.0000),
  vec3(1.0000, 0.7922, 0.4588),
  vec3(0.7647, 0.9843, 0.1686),
  vec3(0.4706, 1.0000, 0.9412),
  vec3(0.7294, 0.9686, 0.4588),
  vec3(1.0000, 0.8392, 0.4706),
  vec3(0.5843, 0.9804, 0.9255),
  vec3(0.8784, 0.8471, 0.8471),
  vec3(0.7412, 0.9569, 0.6824),
  vec3(0.9882, 0.7765, 0.9961),
  vec3(0.9961, 0.9569, 0.1686),
  vec3(1.0000, 0.9922, 0.3608),
  vec3(0.7882, 1.0000, 1.0000),
  vec3(1.0000, 0.9922, 0.6314),
  vec3(1.0000, 1.0000, 1.0000)
);
// PALETTE_END

// 왼쪽 위 원점 텍셀 좌표로 읽는다(wgpu textureLoad와 같게).
vec4 loadTopLeft(ivec2 p) {
  ivec2 size = textureSize(uSource, 0);
  ivec2 c = clamp(p, ivec2(0), size - ivec2(1));
  return texelFetch(uSource, ivec2(c.x, size.y - 1 - c.y), 0);
}

vec4 worldTexel(vec2 cell) {
  vec2 origin = uCenterRadiusAspect.xy;
  vec2 size = uDirectionProgressIntensity.xy;
  vec2 clamped = clamp(cell, vec2(0.0), WORLD_SIZE - vec2(1.0));
  vec2 uv = origin + (clamped + vec2(0.5)) / WORLD_SIZE * size;
  return loadTopLeft(ivec2(uv * uDims));
}

vec3 nearestPalette(vec3 color) {
  vec3 best = PALETTE[0];
  float bestDistance = 1e9;
  for (int index = 0; index < PALETTE_SIZE; index++) {
    vec3 candidate = PALETTE[index];
    vec3 delta = (candidate - color) * vec3(0.9, 1.1, 0.8);
    float distance = dot(delta, delta);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

float hash21(vec2 value) {
  return fract(sin(dot(value, vec2(12.9898, 78.233))) * 43758.547);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uDims.y - gl_FragCoord.y);
  vec2 origin = uCenterRadiusAspect.xy;
  vec2 size = uDirectionProgressIntensity.xy;
  vec2 local = (frag / uDims - origin) / size;
  if (local.x < 0.0 || local.y < 0.0 || local.x >= 1.0 || local.y >= 1.0) {
    fragColor = loadTopLeft(ivec2(frag));
    return;
  }
  float time = uDirectionProgressIntensity.z;
  float amplitude = uDirectionProgressIntensity.w;
  vec2 cell = floor(local * WORLD_SIZE);
  float depth = cell.y / WORLD_SIZE.y;
  // SNES HDMA식 줄 흔들림: 수면 띠에서만 행마다 정수 픽셀만큼 민다.
  float wave = sin(cell.y * 0.19 + time * 2.2) * 0.65 + sin(cell.y * 0.051 - time * 1.1) * 0.35;
  float surfaceBand = 1.0 - smoothstep(0.08, 0.1 + 0.12 * amplitude, depth);
  // 반올림 짝수 규칙으로 줄 흔들림 픽셀을 정한다(기준 기록과 같게).
  float shift = roundEven(wave * amplitude * surfaceBand);
  vec2 source = cell + vec2(shift, 0.0);
  vec2 fromCenter = local * 2.0 - vec2(1.0);
  vec2 aberration = roundEven(fromCenter * uBandOffsetEdgeDesaturation.y * dot(fromCenter, fromCenter));
  vec4 base = worldTexel(source);
  vec3 color = vec3(worldTexel(source + aberration).r, base.g, worldTexel(source - aberration).b);
  float split = uBandOffsetEdgeDesaturation.x;
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  color = color + split * (vec3(-0.02, 0.05, 0.07) * (1.0 - luma) + vec3(0.07, 0.03, -0.04) * luma);
  color = mix(vec3(luma), color, 1.0 + uBandOffsetEdgeDesaturation.w);
  float grain = uBandOffsetEdgeDesaturation.z;
  color = color + (hash21(cell + vec2(floor(time * 12.0), 0.0)) - 0.5) * grain;
  color = clamp(color, vec3(0.0), vec3(1.0));
  float palette = uCenterRadiusAspect.z;
  if (palette > 0.001) {
    color = mix(color, nearestPalette(color), clamp(palette, 0.0, 1.0));
  }
  float scanline = uCenterRadiusAspect.w;
  if (scanline > 0.001) {
    float cellHeight = uDims.y * size.y / WORLD_SIZE.y;
    float row = fract((frag.y - origin.y * uDims.y) / cellHeight);
    color = color * (1.0 - scanline * 0.35 * smoothstep(0.55, 1.0, row));
  }
  fragColor = vec4(color, base.a);
}
