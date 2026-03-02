/**
 * Genetic Algorithm path optimizer for Laser/CNC operations.
 *
 * Solves the Traveling Salesman Problem (TSP) to minimize rapid-move
 * distance between cut paths. Based on the approach from
 * https://github.com/parano/GeneticAlgorithm-TSP (MIT License).
 *
 * Adapted as a self-contained ES5-compatible module (no prototype
 * pollution, no jQuery dependency) for use inside LaserWeb4 web workers.
 */
'use strict';

// ─── helpers ────────────────────────────────────────────────────────
function randomInt(boundary) {
    return Math.floor(Math.random() * boundary);
}

function shuffle(arr) {
    var a = arr.slice(0);
    for (var i = a.length - 1; i > 0; i--) {
        var j = randomInt(i + 1);
        var tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
    }
    return a;
}

function arrNext(arr, index) {
    return index === arr.length - 1 ? arr[0] : arr[index + 1];
}

function arrPrevious(arr, index) {
    return index === 0 ? arr[arr.length - 1] : arr[index - 1];
}

// ─── distance matrix ────────────────────────────────────────────────
function buildDistanceMatrix(points) {
    var n = points.length;
    var d = new Array(n);
    for (var i = 0; i < n; i++) {
        d[i] = new Array(n);
        for (var j = 0; j < n; j++) {
            var dx = points[i].x - points[j].x;
            var dy = points[i].y - points[j].y;
            d[i][j] = Math.sqrt(dx * dx + dy * dy);
        }
    }
    return d;
}

// ─── evaluate (total tour distance) ─────────────────────────────────
function evaluate(individual, dis) {
    // Open tour: we don't return to start, so sum only consecutive edges.
    var sum = 0;
    for (var i = 1; i < individual.length; i++) {
        sum += dis[individual[i - 1]][individual[i]];
    }
    return sum;
}

// ─── random individual ──────────────────────────────────────────────
function randomIndividual(n) {
    var a = [];
    for (var i = 0; i < n; i++) a.push(i);
    return shuffle(a);
}

// ─── mutations ──────────────────────────────────────────────────────
function doMutate(seq) {
    var s = seq.slice(0);
    var m, n;
    do {
        m = randomInt(s.length - 2);
        n = randomInt(s.length);
    } while (m >= n);
    // reverse segment [m..n]
    for (var i = 0, j = ((n - m + 1) >> 1); i < j; i++) {
        var tmp = s[m + i];
        s[m + i] = s[n - i];
        s[n - i] = tmp;
    }
    return s;
}

function pushMutate(seq) {
    var s = seq.slice(0);
    var m, n;
    do {
        m = randomInt(s.length >> 1);
        n = randomInt(s.length);
    } while (m >= n);
    var s1 = s.slice(0, m);
    var s2 = s.slice(m, n);
    var s3 = s.slice(n);
    return s2.concat(s1).concat(s3);
}

// ─── crossover (edge recombination) ─────────────────────────────────
function getChild(fun, population, dis, x, y) {
    var solution = [];
    var px = population[x].slice(0);
    var py = population[y].slice(0);

    var c = px[randomInt(px.length)];
    solution.push(c);

    while (px.length > 1) {
        var dx = fun === 'next'
            ? arrNext(px, px.indexOf(c))
            : arrPrevious(px, px.indexOf(c));
        var dy = fun === 'next'
            ? arrNext(py, py.indexOf(c))
            : arrPrevious(py, py.indexOf(c));

        // remove c from both parents
        px.splice(px.indexOf(c), 1);
        py.splice(py.indexOf(c), 1);

        c = dis[c][dx] < dis[c][dy] ? dx : dy;
        solution.push(c);
    }
    return solution;
}

// ─── 2-opt local improvement ────────────────────────────────────────
function twoOptImprove(seq, dis) {
    var improved = true;
    var s = seq.slice(0);
    while (improved) {
        improved = false;
        for (var i = 0; i < s.length - 2; i++) {
            for (var j = i + 2; j < s.length; j++) {
                var a = s[i], b = s[i + 1], c = s[j], d = j + 1 < s.length ? s[j + 1] : -1;
                var oldDist, newDist;
                if (d >= 0) {
                    oldDist = dis[a][b] + dis[c][d];
                    newDist = dis[a][c] + dis[b][d];
                } else {
                    oldDist = dis[a][b];
                    newDist = dis[a][c];
                }
                if (newDist < oldDist - 1e-10) {
                    // Reverse segment [i+1..j]
                    var left = i + 1, right = j;
                    while (left < right) {
                        var tmp = s[left];
                        s[left] = s[right];
                        s[right] = tmp;
                        left++;
                        right--;
                    }
                    improved = true;
                }
            }
        }
    }
    return s;
}

// ─── depth helpers (mirrors logic in cam.js, kept local to avoid circular deps) ─
function _pathBounds(path) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < path.length; ++i) {
        var p = path[i];
        if (p.X < minX) minX = p.X;
        if (p.X > maxX) maxX = p.X;
        if (p.Y < minY) minY = p.Y;
        if (p.Y > maxY) maxY = p.Y;
    }
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
}

function _boundsContains(outer, inner) {
    return inner.minX >= outer.minX && inner.maxX <= outer.maxX &&
           inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

// ─── main GA solver ─────────────────────────────────────────────────
/**
 * Optimize the ordering of camPaths using a Genetic Algorithm (TSP).
 * Minimizes the total rapid-move distance between the end of one path
 * and the start of the next.
 *
 * @param {Array} camPaths   Array of CamPath objects ({path, safeToClose})
 *                           where each path is an array of {X, Y} points.
 * @param {Object} [opts]    Optional parameters.
 * @param {number} opts.populationSize  GA population size (default 30).
 * @param {number} opts.generations     Number of GA generations (default 500).
 * @param {number} opts.crossoverRate   Crossover probability (default 0.9).
 * @param {number} opts.mutationRate    Mutation probability (default 0.01).
 * @returns {Array}          The same camPaths array, reordered in-place.
 */
export function optimizePathOrderGA(camPaths, opts) {
    if (camPaths.length < 3) return camPaths;

    opts = opts || {};
    var POPULATION_SIZE = opts.populationSize || 30;
    var MAX_GENERATIONS = opts.generations || 500;
    var CROSSOVER_PROBABILITY = opts.crossoverRate || 0.9;
    var MUTATION_PROBABILITY = opts.mutationRate || 0.01;

    // Build "cities" from path start points.
    var n = camPaths.length;
    var points = new Array(n);
    for (var i = 0; i < n; i++) {
        var p = camPaths[i].path;
        if (p && p.length > 0) {
            points[i] = { x: p[0].X, y: p[0].Y };
        } else {
            points[i] = { x: 0, y: 0 };
        }
    }

    var dis = buildDistanceMatrix(points);

    // Initialise population.
    var population = [];
    for (var i = 0; i < POPULATION_SIZE; i++) {
        population.push(randomIndividual(n));
    }

    var values = new Array(POPULATION_SIZE);
    var fitnessValues = new Array(POPULATION_SIZE);
    var roulette = new Array(POPULATION_SIZE);
    var best, bestValue;
    var UNCHANGED_GENS = 0;

    // --- evaluate all & set best ---
    function setBestValue() {
        for (var i = 0; i < population.length; i++) {
            values[i] = evaluate(population[i], dis);
        }
        var bestP = 0, curBestVal = values[0];
        for (var i = 1; i < population.length; i++) {
            if (values[i] < curBestVal) {
                curBestVal = values[i];
                bestP = i;
            }
        }
        if (bestValue === undefined || curBestVal < bestValue) {
            best = population[bestP].slice(0);
            bestValue = curBestVal;
            UNCHANGED_GENS = 0;
        } else {
            UNCHANGED_GENS++;
        }
        return { bestPosition: bestP, bestValue: curBestVal };
    }

    // --- roulette wheel selection ---
    function setRoulette() {
        var sum = 0;
        for (var i = 0; i < values.length; i++) {
            fitnessValues[i] = 1.0 / values[i];
            sum += fitnessValues[i];
        }
        for (var i = 0; i < roulette.length; i++) {
            roulette[i] = fitnessValues[i] / sum;
        }
        for (var i = 1; i < roulette.length; i++) {
            roulette[i] += roulette[i - 1];
        }
    }

    function wheelOut(rand) {
        for (var i = 0; i < roulette.length; i++) {
            if (rand <= roulette[i]) return i;
        }
        return roulette.length - 1;
    }

    // --- selection ---
    function selection(currentBest) {
        var parents = [];
        parents.push(population[currentBest.bestPosition]);
        parents.push(doMutate(best.slice(0)));
        parents.push(pushMutate(best.slice(0)));
        parents.push(best.slice(0));

        setRoulette();
        for (var i = 4; i < POPULATION_SIZE; i++) {
            parents.push(population[wheelOut(Math.random())]);
        }
        population = parents;
    }

    // --- crossover ---
    function crossover() {
        var queue = [];
        for (var i = 0; i < POPULATION_SIZE; i++) {
            if (Math.random() < CROSSOVER_PROBABILITY) {
                queue.push(i);
            }
        }
        // shuffle queue
        queue = shuffle(queue);
        for (var i = 0, j = queue.length - 1; i < j; i += 2) {
            var child1 = getChild('next', population, dis, queue[i], queue[i + 1]);
            var child2 = getChild('previous', population, dis, queue[i], queue[i + 1]);
            population[queue[i]] = child1;
            population[queue[i + 1]] = child2;
        }
    }

    // --- mutation ---
    function mutation() {
        for (var i = 0; i < POPULATION_SIZE; i++) {
            if (Math.random() < MUTATION_PROBABILITY) {
                if (Math.random() > 0.5) {
                    population[i] = pushMutate(population[i]);
                } else {
                    population[i] = doMutate(population[i]);
                }
                i--;
            }
        }
    }

    // ─── run GA ─────────────────────────────────────────────────────
    var currentBest = setBestValue();

    for (var gen = 0; gen < MAX_GENERATIONS; gen++) {
        selection(currentBest);
        crossover();
        mutation();
        currentBest = setBestValue();

        // Early exit if no improvement for a long time.
        if (UNCHANGED_GENS > Math.max(100, n)) break;
    }

    // Apply 2-opt local search to polish the best solution.
    best = twoOptImprove(best, dis);

    // Reorder camPaths in-place according to the best tour.
    var sorted = new Array(n);
    for (var i = 0; i < n; i++) {
        sorted[i] = camPaths[best[i]];
    }
    for (var i = 0; i < n; i++) {
        camPaths[i] = sorted[i];
    }
    return camPaths;
}

/**
 * Optimize path order with GA while preserving the interior-before-exterior
 * constraint ("Order Inside First").
 *
 * Paths are partitioned by their containment depth (how many other paths'
 * bounding boxes fully contain them). GA is then run independently within
 * each depth group to minimise rapid-move travel. Groups are concatenated
 * from deepest (most interior) to shallowest (outermost), so exterior
 * contours are always cut last — regardless of what GA decides within each
 * group.
 *
 * @param {Array}  camPaths  Array of CamPath objects, modified in-place.
 * @param {Object} [opts]    Same options as optimizePathOrderGA.
 * @returns {Array}          The same camPaths array, reordered in-place.
 */
export function optimizePathOrderGAInsideFirst(camPaths, opts) {
    if (camPaths.length < 2) return camPaths;

    // 1. Compute bounding box and containment depth for each path.
    var info = camPaths.map(function(cp) {
        return { bounds: _pathBounds(cp.path) };
    });

    var depth = new Array(camPaths.length);
    for (var i = 0; i < camPaths.length; ++i) {
        var d = 0;
        for (var j = 0; j < camPaths.length; ++j) {
            if (j !== i && _boundsContains(info[j].bounds, info[i].bounds)) {
                d++;
            }
        }
        depth[i] = d;
    }

    // 2. Group original indices by depth.
    var groups = {};
    for (var i = 0; i < camPaths.length; ++i) {
        var d = depth[i];
        if (!groups[d]) groups[d] = [];
        groups[d].push(i);
    }

    // 3. Sort depth levels descending (deepest = most interior first).
    var levels = Object.keys(groups).map(Number).sort(function(a, b) { return b - a; });

    // 4. For each depth group, run GA independently then append its paths.
    var result = [];
    for (var li = 0; li < levels.length; li++) {
        var level = levels[li];
        var groupIndices = groups[level];
        var groupPaths = groupIndices.map(function(idx) { return camPaths[idx]; });

        // Only worth running GA if the group has 3+ paths.
        if (groupPaths.length >= 3) {
            optimizePathOrderGA(groupPaths, opts);
        }

        for (var gi = 0; gi < groupPaths.length; gi++) {
            result.push(groupPaths[gi]);
        }
    }

    // 5. Write back in-place.
    for (var i = 0; i < result.length; i++) {
        camPaths[i] = result[i];
    }

    return camPaths;
}
