/*
 * 3D-Hintergrund: schwebende Glaskörper (three.js, WebGL) hinter der Milchglas-Oberfläche.
 * Reagiert auf Mauszeiger (Parallaxe), Jahres- und Ansichtswechsel (Warp-Impuls) und das Farbschema.
 * Fällt ohne WebGL, ohne three.js oder bei reduzierter Bewegung lautlos auf den CSS-Hintergrund zurück.
 */
(function (UP) {
  'use strict';

  const PALETTE = {
    light: [0x6f9dff, 0x5fd8c8, 0xb79bff, 0xffc58f, 0xff9ec7, 0x8fd3ff],
    dark: [0x3a6df0, 0x14b8a6, 0x8b5cf6, 0xf59e0b, 0xec4899, 0x38bdf8]
  };

  UP.scene3d = {
    started: false,
    running: false,
    impulse: 0,
    spinDir: 1,

    init() {
      if (this.started || !window.THREE || !UP.fx || !UP.fx.on) return;
      const T = window.THREE;
      let renderer;
      try {
        renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      } catch (e) {
        return;
      }
      if (!renderer || !renderer.getContext()) return;
      this.started = true;
      this.T = T;
      this.renderer = renderer;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25) * 0.8);
      renderer.setClearColor(0x000000, 0);
      const canvas = renderer.domElement;
      canvas.className = 'scene3d';
      canvas.setAttribute('aria-hidden', 'true');
      document.querySelector('.aurora').appendChild(canvas);

      const scene = (this.scene = new T.Scene());
      const camera = (this.camera = new T.PerspectiveCamera(42, 1, 0.1, 100));
      camera.position.set(0, 0, 16);

      scene.add(new T.AmbientLight(0xffffff, 0.55));
      const key = new T.DirectionalLight(0xffffff, 0.9);
      key.position.set(6, 9, 12);
      scene.add(key);
      this.lightA = new T.PointLight(0x5b8ff0, 1.4, 60);
      this.lightA.position.set(-10, 6, 8);
      this.lightB = new T.PointLight(0xff7ac6, 1.1, 60);
      this.lightB.position.set(10, -6, 8);
      scene.add(this.lightA, this.lightB);

      const geos = [
        new T.TorusKnotGeometry(0.95, 0.3, 160, 24),
        new T.IcosahedronGeometry(1.35, 0),
        new T.TorusGeometry(1.15, 0.36, 32, 120),
        new T.OctahedronGeometry(1.3, 0),
        new T.SphereGeometry(1.05, 48, 48),
        new T.DodecahedronGeometry(1.2, 0),
        new T.TorusGeometry(0.8, 0.22, 24, 90),
        new T.IcosahedronGeometry(0.9, 0)
      ];
      const layout = [
        [-11.5, 5.2, -3, 1.4], [10.8, 5.6, -4, 1.6], [-9.5, -5.4, -2, 1.2], [11.5, -4.8, -1, 1.3],
        [-2.5, 7.4, -7, 1.1], [3.8, -7.2, -6, 1.5], [-5.5, -8.2, -9, 1.6], [-14.5, 0.2, -6, 1.0]
      ];
      this.group = new T.Group();
      scene.add(this.group);
      this.meshes = geos.map((g, i) => {
        const faceted = g.type !== 'SphereGeometry' && g.type !== 'TorusKnotGeometry' && g.type !== 'TorusGeometry';
        const mat = new T.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 0.15,
          roughness: faceted ? 0.08 : 0.18,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          reflectivity: 0.7,
          transparent: true,
          opacity: 0.9,
          flatShading: faceted
        });
        const m = new T.Mesh(g, mat);
        const [x, y, z, s] = layout[i];
        m.position.set(x, y, z);
        m.scale.setScalar(s);
        m.userData = {
          base: new T.Vector3(x, y, z),
          rot: new T.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.3),
          phase: Math.random() * Math.PI * 2,
          float: 0.35 + Math.random() * 0.45,
          color: new T.Color()
        };
        m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
        this.group.add(m);
        return m;
      });
      this.applyTheme(true);

      this.pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      window.addEventListener('pointermove', (e) => {
        this.pointer.tx = e.clientX / innerWidth - 0.5;
        this.pointer.ty = e.clientY / innerHeight - 0.5;
      }, { passive: true });
      window.addEventListener('resize', () => this.resize());
      document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.start()));
      new MutationObserver(() => this.applyTheme()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-fx'] });
      this.resize();
      this.clock = new T.Clock();
      document.documentElement.classList.add('has-3d');
      this.start();
    },

    applyTheme(immediate) {
      if (!this.started) return;
      const dark = document.documentElement.dataset.theme === 'dark';
      const pal = dark ? PALETTE.dark : PALETTE.light;
      this.meshes.forEach((m, i) => {
        m.userData.color.setHex(pal[i % pal.length]);
        m.material.emissive = m.material.emissive || new this.T.Color();
        m.material.emissive.setHex(pal[i % pal.length]);
        m.material.emissiveIntensity = dark ? 0.22 : 0.04;
        m.material.opacity = dark ? 0.8 : 0.88;
        if (immediate) m.material.color.copy(m.userData.color);
      });
      this.lightA.intensity = dark ? 1.8 : 1.3;
      this.lightB.intensity = dark ? 1.4 : 1.0;
      if (document.documentElement.dataset.fx === 'off') this.stop();
      else this.start();
    },

    resize() {
      if (!this.started) return;
      const w = innerWidth, h = innerHeight;
      this.renderer.setSize(w, h, false);
      this.renderer.domElement.style.width = `${w}px`;
      this.renderer.domElement.style.height = `${h}px`;
      this.camera.aspect = w / h;
      // Bei schmalen Fenstern weiter wegrücken, damit die Körper sichtbar bleiben
      this.camera.position.z = w / h < 1 ? 24 : 16;
      this.camera.updateProjectionMatrix();
      if (!this.running) this.renderer.render(this.scene, this.camera);
    },

    /** Warp-Impuls (z. B. beim Jahreswechsel): kurz schneller drehen und heranzoomen */
    pulse(dir = 1, strength = 1) {
      this.spinDir = dir >= 0 ? 1 : -1;
      this.impulse = Math.min(2.2, this.impulse + strength);
    },

    start() {
      if (!this.started || this.running || document.hidden || document.documentElement.dataset.fx === 'off') return;
      this.running = true;
      this.last = 0;
      const loop = (t) => {
        if (!this.running) return;
        this.raf = requestAnimationFrame(loop);
        // ca. 45 fps genügen – schont Akku und GPU
        if (t - this.last < 22) return;
        this.last = t;
        this.frame();
      };
      this.raf = requestAnimationFrame(loop);
    },

    stop() {
      this.running = false;
      cancelAnimationFrame(this.raf);
    },

    frame() {
      const dt = Math.min(0.05, this.clock.getDelta());
      const t = this.clock.elapsedTime;
      const p = this.pointer;
      if (document.body.classList.contains('dragging')) return;
      p.x += (p.tx - p.x) * 0.05;
      p.y += (p.ty - p.y) * 0.05;
      this.impulse *= 0.955;
      const boost = 1 + this.impulse * 6;
      this.group.rotation.y = p.x * 0.35 + Math.sin(t * 0.05) * 0.08;
      this.group.rotation.x = p.y * 0.25;
      this.group.rotation.z += dt * 0.05 * this.impulse * this.spinDir;
      this.camera.position.x = p.x * 1.6;
      this.camera.position.y = -p.y * 1.0;
      this.camera.fov = 42 - this.impulse * 5;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(0, 0, 0);
      this.meshes.forEach((m) => {
        const u = m.userData;
        m.rotation.x += u.rot.x * dt * boost;
        m.rotation.y += u.rot.y * dt * boost * this.spinDir;
        m.rotation.z += u.rot.z * dt * boost;
        m.position.y = u.base.y + Math.sin(t * u.float + u.phase) * 0.6;
        m.position.x = u.base.x + Math.cos(t * u.float * 0.7 + u.phase) * 0.35;
        m.position.z = u.base.z + this.impulse * 2.5;
        m.material.color.lerp(u.color, 0.04);
      });
      this.lightA.position.x = -10 + Math.sin(t * 0.3) * 4;
      this.lightB.position.y = -6 + Math.cos(t * 0.25) * 4;
      this.renderer.render(this.scene, this.camera);
    }
  };
})(window.UP = window.UP || {});
