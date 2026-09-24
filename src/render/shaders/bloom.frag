// bloom: threshold / separable Gaussian blur / additive composite.
precision highp float;
uniform sampler2D uSource;
uniform int uMode; // 0 threshold, 1 blur, 2 composite
uniform vec4 uTexelThreshold; // texel.xy, threshold, soft knee
uniform vec4 uDirectionWeight; // direction.xy, composite weight, kernel radius
uniform vec4 uTintClamp; // tint.rgb, clamp
in vec2 vUv;
out vec4 fragColor;
void main() {
  if (uMode == 0) {
    vec3 color = min(texture(uSource, vUv).rgb, vec3(uTintClamp.w));
    float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float threshold = uTexelThreshold.z;
    float knee = max(uTexelThreshold.w, 0.0001);
    fragColor = vec4(color * smoothstep(threshold, threshold + knee, luminance), 0.0);
  } else if (uMode == 1) {
    vec2 direction = uDirectionWeight.xy * uTexelThreshold.xy;
    float radius = uDirectionWeight.w;
    float sigma = radius / 3.0;
    vec4 color = texture(uSource, vUv) * (0.39894 / sigma);
    for (int index = 1; index < 11; index++) {
      float offset = float(index);
      if (offset < radius) {
        float weight = 0.39894 * exp(-0.5 * offset * offset / (sigma * sigma)) / sigma;
        color += texture(uSource, vUv + direction * offset) * weight;
        color += texture(uSource, vUv - direction * offset) * weight;
      }
    }
    fragColor = color;
  } else {
    vec4 color = texture(uSource, vUv);
    fragColor = vec4(color.rgb * uDirectionWeight.z * uTintClamp.rgb, 0.0);
  }
}
