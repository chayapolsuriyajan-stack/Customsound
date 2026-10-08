// Off-axis ("window") projection.
// The physical screen is a W x H rectangle centred at the origin on the z = 0 plane,
// world units are centimetres, and the viewer's eye sits at `eye` (z > 0).
// Building an asymmetric frustum through the screen edges makes the monitor behave
// like a window into the 3D scene (Kooima, "Generalized Perspective Projection").

export function applyOffAxis(camera, eye, screenW, screenH, near = 1, far = 5000) {
  const ez = Math.max(eye.z, near + 0.01);
  const k = near / ez;
  const left = (-screenW / 2 - eye.x) * k;
  const right = (screenW / 2 - eye.x) * k;
  const bottom = (-screenH / 2 - eye.y) * k;
  const top = (screenH / 2 - eye.y) * k;

  camera.position.set(eye.x, eye.y, ez);
  camera.quaternion.identity(); // screen is parallel to the image plane: look straight down -Z
  camera.near = near;
  camera.far = far;
  camera.projectionMatrix.makePerspective(left, right, top, bottom, near, far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.updateMatrixWorld(true);
}
