// Used only when serving the built app with `vite preview` inside the Docker
// image. It forwards /api to the backend — the same job nginx would do.
export default {
  preview: {
    // Vite rejects requests whose Host header it does not recognise (a DNS
    // rebinding defence, GHSA-vg6x-rcgg-rjx6). Only IP literals, localhost and
    // *.localhost pass implicitly, so a real domain gets:
    //
    //   403 Blocked request. This host (...) is not allowed.
    //
    // The trap is that the pods still look healthy: kubelet's probes send
    // `Host: <pod-IP>`, and IPs are always allowed, so readiness passes while
    // every browser gets a 403.
    //
    // A leading dot allows a domain and its subdomains. Never set this to
    // `true` — that turns the check off for every host on the internet.
    allowedHosts: [
      'devboard.trainwithshubham.com',
      '.elb.amazonaws.com',
    ],
    proxy: {
      // The three paths the Gateway owns as Exact matches (k8s/httproute.yml),
      // mirrored one-for-one. Locally in compose there is no Gateway in front,
      // so the UI's same-origin /api/ai/* calls need this door. In the cluster
      // these keys are shadowed anyway: the HTTPRoute matches ask/summarise/
      // health first and sends them straight to ai-service, so the frontend
      // pod never sees them there.
      //
      // Deliberately NOT a blanket '/api/ai' prefix: ai-service also serves
      // /metrics (app/main.py), and a prefix rule would be a SECOND,
      // independent route into ai-service that bypasses the Exact matches —
      // which is how /metrics stayed publicly reachable at /api/ai/metrics
      // even after the HTTPRoute was tightened. Narrow keys, one lock:
      // anything else under /api/ai falls through to the /api rule below and
      // 404s at the Go backend, in the cluster and locally alike.
      '/api/ai/ask': {
        target: 'http://ai-service:3005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ai/, ''),
      },
      '/api/ai/summarise': {
        target: 'http://ai-service:3005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ai/, ''),
      },
      '/api/ai/health': {
        target: 'http://ai-service:3005',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ai/, ''),
      },
      '/api': {
        target: 'http://backend:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
};
