// Lead-In / Lead-Out path generation for laser cut and mill operations.
//
// A lead-in is a short extra segment (line or arc) inserted BEFORE the actual
// cut start point so the laser/tool is already at full power when it first
// touches the workpiece contour, eliminating the entry burn mark or dwell mark.
// A lead-out does the same symmetrically at the exit point.
//
// All coordinates are in Clipper integer units.  The caller is responsible for
// converting mm lengths to Clipper units by multiplying with mmToClipperScale.
//
// Angle convention (degrees):
//   0°  = tangential approach / exit (along the cut direction)
//   90° = perpendicular approach / exit
//   Positive values rotate CCW from the tangent.
//
// Reference: https://support.thunderlaserusa.com/portal/en/kb/articles/lead-in-and-lead-out

'use strict';

const DEG2RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// Internal geometry helpers
// ---------------------------------------------------------------------------

/** Axis-aligned bounding box of a Clipper path. */
function pathBounds(path) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of path) {
        if (p.X < minX) minX = p.X;
        if (p.Y < minY) minY = p.Y;
        if (p.X > maxX) maxX = p.X;
        if (p.Y > maxY) maxY = p.Y;
    }
    return { minX, minY, maxX, maxY };
}

/** True when `outer` fully contains `inner` (bounding box test). */
function boundsContains(outer, inner) {
    return inner.minX >= outer.minX &&
           inner.minY >= outer.minY &&
           inner.maxX <= outer.maxX &&
           inner.maxY <= outer.maxY;
}

/**
 * For each camPath compute its containment depth (0 = outermost).
 * Returns an array of depth integers parallel to camPaths.
 */
function computeDepths(camPaths) {
    const bounds = camPaths.map(cp => pathBounds(cp.path));
    return bounds.map((b, i) =>
        bounds.reduce((d, ob, j) => d + (j !== i && boundsContains(ob, b) ? 1 : 0), 0)
    );
}

/**
 * Generate N+1 Clipper {X,Y} points along a circular arc.
 * The arc starts at startAngleRad and sweeps by sweepRad (signed).
 * Positive sweepRad = CCW, negative = CW.
 */
function arcPoints(cx, cy, radius, startAngleRad, sweepRad, n = 16) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
        const a = startAngleRad + sweepRad * (i / n);
        pts.push({ X: Math.round(cx + Math.cos(a) * radius), Y: Math.round(cy + Math.sin(a) * radius) });
    }
    return pts;
}

/**
 * Return the signed arc sweep in radians for the given user angle and side.
 * Positive sweep = CCW (inside the contour for a typical CCW contour).
 * Negative sweep = CW  (outside).
 */
function arcSweep(angleDeg, inside) {
    // Clipper uses Y-down (screen) coordinates, so CCW/CW are flipped relative
    // to standard maths.  A positive sweep (CCW in maths) is actually CW on
    // screen, i.e. towards the INSIDE of a contour that looks CCW to the user.
    // We therefore invert the sign so that inside=false → exterior approach.
    return (inside ? -1 : 1) * angleDeg * DEG2RAD;
}

// ---------------------------------------------------------------------------
// Lead-in builders
// ---------------------------------------------------------------------------

/**
 * Line lead-in: a straight segment from leadStart to path[0].
 * The approach direction deviates from the tangent by angleDeg degrees.
 * For inside=false the laser approaches from outside the contour.
 *
 * @param {object[]} path         Clipper path [{X,Y},...], open (no dup closing point)
 * @param {number}   lengthClipper segment length in Clipper units
 * @param {number}   angleDeg      deviation from cut tangent, degrees
 * @param {boolean}  inside        true → approach from inside the contour
 * @returns {object[]}            points to prepend before path[0]
 */
function lineLeadIn(path, lengthClipper, angleDeg, inside) {
    if (path.length < 2) return [];
    const dx = path[1].X - path[0].X;
    const dy = path[1].Y - path[0].Y;
    const tangentAngle = Math.atan2(dy, dx);
    // Clipper Y-down: inside=true → sideOffset=0, inside=false → sideOffset=π
    const sideOffset   = inside ? 0 : Math.PI;
    const approachDir  = tangentAngle + sideOffset + angleDeg * DEG2RAD;
    return [{
        X: Math.round(path[0].X - Math.cos(approachDir) * lengthClipper),
        Y: Math.round(path[0].Y - Math.sin(approachDir) * lengthClipper),
    }];
}

/**
 * Arc lead-in: a smooth arc that arrives tangentially at path[0].
 * angleDeg is used as the arc sweep angle; length defines the arc length.
 *
 * @param {object[]} path
 * @param {number}   lengthClipper arc length in Clipper units
 * @param {number}   angleDeg      arc sweep angle in degrees (≠ 0)
 * @param {boolean}  inside
 * @param {number}   arcSegs       number of line segments to approximate the arc
 * @returns {object[]}
 */
function arcLeadIn(path, lengthClipper, angleDeg, inside, arcSegs = 16) {
    if (path.length < 2 || angleDeg === 0) return [];

    const sweep  = arcSweep(angleDeg, inside);                // signed radians
    const radius = lengthClipper / Math.abs(sweep);            // arc length = r * |sweep|
    if (radius < 1) return [];

    const dx     = path[1].X - path[0].X;
    const dy     = path[1].Y - path[0].Y;
    const tAngle = Math.atan2(dy, dx);

    // Center is perpendicular to tangent at path[0]:
    //   sweep > 0 (CCW) → center to the LEFT  (tangent + 90°)
    //   sweep < 0 (CW)  → center to the RIGHT (tangent - 90°)
    const perpAngle = tAngle + (sweep > 0 ? Math.PI / 2 : -Math.PI / 2);
    const cx = path[0].X + Math.cos(perpAngle) * radius;
    const cy = path[0].Y + Math.sin(perpAngle) * radius;

    // Angle from center to path[0] is the arc END angle
    const endAngle   = perpAngle + Math.PI;
    const startAngle = endAngle - sweep;

    const pts = arcPoints(cx, cy, radius, startAngle, sweep, arcSegs);
    // Last point equals path[0]; remove it since the caller will concatenate the path
    return pts.slice(0, -1);
}

// ---------------------------------------------------------------------------
// Lead-out builders
// ---------------------------------------------------------------------------

/**
 * Line lead-out: a straight segment from path[last] onward.
 *
 * @param {object[]} openPath  path without duplicate closing point
 * @param {number}   lengthClipper
 * @param {number}   angleDeg
 * @param {boolean}  inside
 * @returns {object[]}
 */
function lineLeadOut(openPath, lengthClipper, angleDeg, inside) {
    const n = openPath.length;
    if (n < 2) return [];
    // The closing segment: openPath[n-1] → openPath[0]; exit tangent is that direction
    const dx = openPath[0].X - openPath[n - 1].X;
    const dy = openPath[0].Y - openPath[n - 1].Y;
    const tangentAngle = Math.atan2(dy, dx);
    // Clipper Y-down: inside=true → sideOffset=0, inside=false → sideOffset=π
    const sideOffset   = inside ? 0 : Math.PI;
    const exitDir      = tangentAngle + sideOffset + angleDeg * DEG2RAD;
    return [{
        X: Math.round(openPath[0].X + Math.cos(exitDir) * lengthClipper),
        Y: Math.round(openPath[0].Y + Math.sin(exitDir) * lengthClipper),
    }];
}

/**
 * Arc lead-out: a smooth arc that departs tangentially from path[last] (= openPath[0]).
 *
 * @param {object[]} openPath  path without duplicate closing point
 * @param {number}   lengthClipper
 * @param {number}   angleDeg
 * @param {boolean}  inside
 * @param {number}   arcSegs
 * @returns {object[]}
 */
function arcLeadOut(openPath, lengthClipper, angleDeg, inside, arcSegs = 16) {
    const n = openPath.length;
    if (n < 2 || angleDeg === 0) return [];

    const sweep  = arcSweep(angleDeg, inside);
    const radius = lengthClipper / Math.abs(sweep);
    if (radius < 1) return [];

    // Exit tangent: direction from openPath[n-1] to openPath[0] (closing segment)
    const dx     = openPath[0].X - openPath[n - 1].X;
    const dy     = openPath[0].Y - openPath[n - 1].Y;
    const tAngle = Math.atan2(dy, dx);

    const perpAngle  = tAngle + (sweep > 0 ? Math.PI / 2 : -Math.PI / 2);
    const cx = openPath[0].X + Math.cos(perpAngle) * radius;
    const cy = openPath[0].Y + Math.sin(perpAngle) * radius;

    // Angle from center to openPath[0] is the arc START angle
    const startAngle = perpAngle + Math.PI;
    const endAngle   = startAngle + sweep;

    const pts = arcPoints(cx, cy, radius, startAngle, sweep, arcSegs);
    // First point equals openPath[0]; exclude it
    return pts.slice(1);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply lead-in / lead-out to all CLOSED paths in a camPaths array.
 *
 * Open paths (lines, polylines) are left untouched.
 * The camPath objects are mutated in place: camPath.path is replaced.
 *
 * Parameters come from the operation object (op) and mmToClipperScale
 * from the mesh module.
 *
 * Relevant op fields (with defaults shown):
 *   op.leadIn         {boolean}  false  — enable lead-in
 *   op.leadInShape    {string}   'line' — 'line' | 'arc'
 *   op.leadInLength   {number}   2      — length in mm
 *   op.leadInAngle    {number}   45     — angle in degrees
 *   op.leadOut        {boolean}  false  — enable lead-out
 *   op.leadOutShape   {string}   'line' — 'line' | 'arc'
 *   op.leadOutLength  {number}   2      — length in mm
 *   op.leadOutAngle   {number}   45     — angle in degrees
 *   op.leadInside     {boolean}  false  — approach/exit from inside the contour
 *
 * @param {object[]} camPaths        Array of { path, safeToClose }
 * @param {object}   op              Operation object
 * @param {number}   mmToClipperScale Multiplier: mm → Clipper units
 */
export function applyLeadInOutToCamPaths(camPaths, op, mmToClipperScale) {
    const hasLeadIn  = !!(op.leadIn  && op.leadInLength  > 0);
    const hasLeadOut = !!(op.leadOut && op.leadOutLength > 0);
    if (!hasLeadIn && !hasLeadOut) return;

    // When leadOuterOnly is enabled (default), only apply to the outermost
    // contours (containment depth === 0).  Inner contours / pockets are left
    // untouched.
    const outerOnly = op.leadOuterOnly !== false; // default true
    const depths = outerOnly ? computeDepths(camPaths) : null;

    const inside       = !op.leadInside;  // checkbox true = "inside" approach; geometry convention is inverted
    const inLength     = (op.leadInLength  || 2)  * mmToClipperScale;
    const inAngle      = op.leadInAngle  !== undefined ? op.leadInAngle  : 45;
    const inShape      = op.leadInShape  || 'line';
    const outLength    = (op.leadOutLength || 2)  * mmToClipperScale;
    const outAngle     = op.leadOutAngle !== undefined ? op.leadOutAngle : 45;
    const outShape     = op.leadOutShape || 'line';
    const arcSegs      = 16;

    for (let idx = 0; idx < camPaths.length; idx++) {
        const camPath = camPaths[idx];
        const path = camPath.path;
        if (!path || path.length < 2) continue;

        // Skip inner contours when leadOuterOnly is active.
        if (depths !== null && depths[idx] !== 0) continue;

        // Only closed contour paths get lead-in/out.
        // A Clipper closed path has path[first] === path[last].
        const last = path.length - 1;
        const isClosed =
            path[0].X === path[last].X &&
            path[0].Y === path[last].Y;
        if (!isClosed) continue;

        // Remove the duplicate closing point → open version
        const open = path.slice(0, -1);
        if (open.length < 2) continue;

        // --- Lead-in: points to prepend ---
        let leadInPts = [];
        if (hasLeadIn) {
            leadInPts = inShape === 'arc'
                ? arcLeadIn(open, inLength, inAngle, inside, arcSegs)
                : lineLeadIn(open, inLength, inAngle, inside);
        }

        // --- Lead-out: points to append after the close-back-to-start ---
        let leadOutPts = [];
        if (hasLeadOut) {
            leadOutPts = outShape === 'arc'
                ? arcLeadOut(open, outLength, outAngle, inside, arcSegs)
                : lineLeadOut(open, outLength, outAngle, inside);
        }

        // Rebuild: leadIn → full open contour → close back to open[0] → leadOut
        // The closing point (open[0]) is appended so the cut returns to the entry
        // point before the lead-out departs.
        camPath.path = [...leadInPts, ...open, open[0], ...leadOutPts];
    }
}
