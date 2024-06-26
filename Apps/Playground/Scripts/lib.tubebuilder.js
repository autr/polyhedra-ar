// #define JAVASCRIPT

export function GetTubeVertexData( { path, radius, resolution, cornerResolution, capEnds } ) {


	const strokePoints = PrepareSmoothStrokes( 
		path, 
		radius/2, 
		cornerResolution, 
		capEnds === 2 ? true : false, // closeEnds
		capEnds === 3 ? true : false, // closeEnds
		resolution
	)

	const tubeConfig = {
		path: strokePoints,
		radius: radius / 2,
		tessellation: resolution,
		cap: capEnds === 2 ? 3 : 0,
		sideOrientation: 2,
		updatable: true
	}

	const vertexData = CreateTubeVertexData( tubeConfig )

	return vertexData
}

export function CalculateOffset(current, previous, next, radius) {
	const vecToLast = previous.subtract(current).normalize()
	const vecToNext = next.subtract(current).normalize()
	const dotProduct = BB.Vector3.Dot(vecToLast, vecToNext)
	const clampedDotProduct = Math.max(-1, Math.min(1, dotProduct))
	const angle = Math.acos(clampedDotProduct)
	const distance = radius * Math.sin(Math.PI / 2 - angle / 2)
	return Math.max(distance, 0.01)
}

export function PrepareSmoothStrokes( points = [], radius, smooth, close, roundedEnds, sides ) {

	if (close) points = [...points]
	let strokePoints = []
	const length = points.length
	for (let i = 0; i < length; i++) {
		let last = points[i - 1]
		if (!last && close) last = points[length-1]
		const current = points[i]
		let next = points[i+1]
		if (!next && close) next = points[0]

		if (last && next) {

			const distance = CalculateOffset(current, last, next, radius)
			const edgeA = current.clone().moveToward(last.clone(), distance)
			const edgeB = current.clone().moveToward(next.clone(), distance)
			const math = BB.Curve3.CreateQuadraticBezier( edgeA, current, edgeB, smooth + 1 )
			if (smooth == 0) {
				strokePoints = [ ...strokePoints, edgeA, edgeB ]
			} else if (smooth == 1) {
				strokePoints = [ ...strokePoints, edgeA, current, edgeB ]
			} else {
				strokePoints = [ ...strokePoints, edgeA, ...math.getPoints(), edgeB ]
			}
		} else if (!close) {
			strokePoints = [...strokePoints, current ]
		}

	}

	// ----- ROUNDED ENDS -------

	if ( roundedEnds ) {
		const segment = (radius * 1) / sides
		const first = strokePoints[0].clone()
		const second = strokePoints[1].clone()
		const last = strokePoints[strokePoints.length-1].clone()
		const secondlast = strokePoints[strokePoints.length-2].clone()
		for (let i = 0; i < sides; i++) {
			strokePoints = [ first.clone().moveToward( second, segment * -(i+1) ), ...strokePoints ]
			strokePoints = [ ...strokePoints, last.clone().moveToward( secondlast, segment * -(i+1) ) ]
		}
	}
	if ( close ) strokePoints = [ ...strokePoints, strokePoints[0].clone() ]

	return strokePoints
}


export function CreateTubeVertexData(options) {

	const path = options.path;
	let radius = 1.0;
	if (options.radius !== undefined) radius = options.radius;
	const tessellation = options.tessellation || 64 | 0;
	const radiusFunction = options.radiusFunction || null;
	let cap = options.cap || BB.Mesh.NO_CAP;
	const invertUV = options.invertUV || false;
	const updatable = options.updatable;
	const sideOrientation = BB.Mesh._GetDefaultSideOrientation(options.sideOrientation);
	options.arc = options.arc && (options.arc <= 0.0 || options.arc > 1.0) ? 1.0 : options.arc || 1.0;

	const tubePathArray = (path, path3D, circlePaths, radius, tessellation, radiusFunction, cap, arc) => {
		const tangents = path3D.getTangents();
		const normals = path3D.getNormals();
		const distances = path3D.getDistances();
		const pi2 = Math.PI * 2;
		const step = (pi2 / tessellation) * arc;
		const returnRadius = () => radius;
		const radiusFunctionFinal = radiusFunction || returnRadius;
		let circlePath;
		let rad;
		let normal;
		let rotated;
		const rotationMatrix = BB.TmpVectors.Matrix[0];
		let index = cap === BB.Mesh.NO_CAP || cap === BB.Mesh.CAP_END ? 0 : 2;
		for (let i = 0; i < path.length; i++) {
			rad = radiusFunctionFinal(i, distances[i]); // current radius
			circlePath = Array(); // current circle array
			normal = normals[i]; // current normal
			for (let t = 0; t < tessellation; t++) {
				BB.Matrix.RotationAxisToRef(tangents[i], step * t, rotationMatrix);
				rotated = circlePath[t] ? circlePath[t] : BB.Vector3.Zero();
				BB.Vector3.TransformCoordinatesToRef(normal, rotationMatrix, rotated);
				rotated.scaleInPlace(rad).addInPlace(path[i]);
				circlePath[t] = rotated;
			}
			circlePaths[index] = circlePath;
			index++;
		}
		// cap
		const capPath = (nbPoints, pathIndex) => {
			const pointCap = Array();
			for (let i = 0; i < nbPoints; i++) {
				pointCap.push(path[pathIndex]);
			}
			return pointCap;
		};
		switch (cap) {
			case BB.Mesh.NO_CAP:
				break;
			case BB.Mesh.CAP_START:
				circlePaths[0] = capPath(tessellation, 0);
				circlePaths[1] = circlePaths[2].slice(0);
				break;
			case BB.Mesh.CAP_END:
				circlePaths[index] = circlePaths[index - 1].slice(0);
				circlePaths[index + 1] = capPath(tessellation, path.length - 1);
				break;
			case BB.Mesh.CAP_ALL:
				circlePaths[0] = capPath(tessellation, 0);
				circlePaths[1] = circlePaths[2].slice(0);
				circlePaths[index] = circlePaths[index - 1].slice(0);
				circlePaths[index + 1] = capPath(tessellation, path.length - 1);
				break;
			default:
				break;
		}
		return circlePaths;
	};
	let path3D;
	let pathArray;

	path3D = new BB.Path3D(path);
	const newPathArray = new Array();
	cap = cap < 0 || cap > 3 ? 0 : cap;
	pathArray = tubePathArray(path, path3D, newPathArray, radius, tessellation, radiusFunction, cap, options.arc);

	const ribbonOptions = {
		pathArray: pathArray,
		closePath: true,
		closeArray: false,
		updatable: updatable,
		sideOrientation: sideOrientation,
		invertUV: invertUV,
		frontUVs: options.frontUVs,
		backUVs: options.backUVs
	}

	const vertexData = BB.CreateRibbonVertexData(ribbonOptions)
	return vertexData

}