// A spiral is a winding path whose radius changes as it circles its center.
// Match that geometry rather than the exact guide, so hand-drawn paths work too.
const TAU = Math.PI * 2;

export function recognizeSpiral(points) {
  const clean = [];
  for (const point of Array.isArray(points) ? points : []) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const previous = clean.at(-1);
    if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) > 0.25) {
      clean.push({ x: point.x, y: point.y });
    }
  }
  if (clean.length < 5) return result(false, 'short');

  const bounds = getBounds(clean);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const span = Math.max(width, height);
  const length = pathLength(clean);
  if (span < 64 || length < 120) return result(false, 'size');
  if (Math.min(width, height) < 24 || length < span * 1.7) return result(false, 'turns');

  const sampled = resample(clean, length, 144);
  const smooth = sampled.map((point, index) => {
    if (index === 0 || index === sampled.length - 1) return point;
    const before = sampled[index - 1];
    const after = sampled[index + 1];
    return { x: (before.x + point.x * 2 + after.x) / 4, y: (before.y + point.y * 2 + after.y) / 4 };
  });
  const transforms = getTransforms(smooth, width, height, span);
  const centers = getCenters(clean, bounds, width, height);
  let hasEnoughTurns = false;

  for (const transform of transforms) {
    for (const center of centers) {
      const polar = smooth.map(point => {
        const [x, y] = transform(point.x - center.x, point.y - center.y);
        return { radius: Math.hypot(x, y), angle: Math.atan2(y, x) };
      });
      const maxRadius = Math.max(...polar.map(point => point.radius));
      // Very near the center, tiny hand movements make angles unreliable.
      const orbit = polar.filter(point => point.radius >= maxRadius * 0.085);
      if (orbit.length < 12) continue;

      let winding = 0;
      let angleTravel = 0;
      const phases = [0];
      for (let index = 1; index < orbit.length; index++) {
        const difference = orbit[index].angle - orbit[index - 1].angle;
        const delta = Math.atan2(Math.sin(difference), Math.cos(difference));
        winding += delta;
        angleTravel += Math.abs(delta);
        phases.push(winding);
      }
      const turns = Math.abs(winding) / TAU;
      if (turns < 1.4 || turns > 4.5) continue;
      hasEnoughTurns = true;
      if (Math.abs(winding) / angleTravel < 0.8) continue;

      const direction = Math.sign(winding);
      const progress = phases.map(phase => phase * direction);
      const radii = orbit.map(point => point.radius);
      const trend = correlationSquared(progress, radii);
      if (trend < 0.54) continue;

      const start = [];
      const finish = [];
      const total = Math.abs(winding);
      for (let index = 0; index < orbit.length; index++) {
        if (progress[index] <= total * 0.2) start.push(radii[index]);
        if (progress[index] >= total * 0.8) finish.push(radii[index]);
      }
      if (!start.length || !finish.length) continue;
      const inner = Math.min(mean(start), mean(finish));
      const outer = Math.max(mean(start), mean(finish));
      if (outer - inner < maxRadius * 0.32 || inner / outer > 0.65) continue;

      return result(true, 'complete');
    }
  }
  return result(false, hasEnoughTurns ? 'shape' : 'turns');
}

function result(success, reason) {
  return { success, reason };
}

function getBounds(points) {
  return {
    minX: Math.min(...points.map(point => point.x)),
    maxX: Math.max(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxY: Math.max(...points.map(point => point.y))
  };
}

function pathLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index++) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return length;
}

function resample(points, length, count) {
  const sampled = [points[0]];
  const spacing = length / (count - 1);
  let segmentStart = 0;
  let index = 1;
  for (let sample = 1; sample < count - 1; sample++) {
    const target = sample * spacing;
    let segmentLength = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    while (segmentStart + segmentLength < target && index < points.length - 1) {
      segmentStart += segmentLength;
      index++;
      segmentLength = Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
    }
    const fraction = Math.min(1, (target - segmentStart) / segmentLength);
    sampled.push({
      x: points[index - 1].x + (points[index].x - points[index - 1].x) * fraction,
      y: points[index - 1].y + (points[index].y - points[index - 1].y) * fraction
    });
  }
  sampled.push(points.at(-1));
  return sampled;
}

function getCenters(points, bounds, width, height) {
  const centers = [];
  const anchors = [
    { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 },
    points[0],
    points.at(-1)
  ];
  for (const anchor of anchors) {
    for (let x = -2; x <= 2; x++) {
      for (let y = -2; y <= 2; y++) {
        centers.push({ x: anchor.x + width * x * 0.04, y: anchor.y + height * y * 0.04 });
      }
    }
  }
  return centers;
}

function getTransforms(points, width, height, span) {
  const averageX = mean(points.map(point => point.x));
  const averageY = mean(points.map(point => point.y));
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const point of points) {
    const x = point.x - averageX;
    const y = point.y - averageY;
    xx += x * x;
    yy += y * y;
    xy += x * y;
  }
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  const discriminant = Math.hypot(xx - yy, 2 * xy);
  const major = Math.sqrt((xx + yy + discriminant) / 2);
  const minor = Math.sqrt(Math.max((xx + yy - discriminant) / 2, major * major * 0.06));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // The rotated transform also tolerates slanted, elliptical spirals.
  return [
    (x, y) => [x / span, y / span],
    (x, y) => [x / width, y / height],
    (x, y) => [(x * cos + y * sin) / major, (-x * sin + y * cos) / minor]
  ];
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function correlationSquared(x, y) {
  const averageX = mean(x);
  const averageY = mean(y);
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let index = 0; index < x.length; index++) {
    const dx = x[index] - averageX;
    const dy = y[index] - averageY;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  return xx && yy ? (xy * xy) / (xx * yy) : 0;
}
