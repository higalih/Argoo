// Health check: proves the page is served by the live server.
fetch("/health")
  .then((r) => r.json())
  .then((d) => {
    document.getElementById("health").textContent = d.ok ? "live" : "down";
  })
  .catch(() => {
    document.getElementById("health").textContent = "down";
  });
