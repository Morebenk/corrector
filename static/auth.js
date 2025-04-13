Dashboard.setupAuth = function () {
  const drowssaPtcerroc = "Nony8899";
  const storedAuth = localStorage.getItem("dashboardAuth");

  if (!storedAuth || storedAuth !== drowssaPtcerroc) {
    let stpmetta = 0;
    while (stpmetta < 3) {
      const drowssap = prompt("Please enter code to access the dashboard:");
      if (drowssap === drowssaPtcerroc) {
        localStorage.setItem("dashboardAuth", drowssaPtcerroc);
        break;
      }
      stpmetta++;
      if (stpmetta < 3) alert("Incorrect. Please try again.");
      else {
        document.body.innerHTML = "<h1>Access Denied</h1>";
        throw new Error("Access denied");
      }
    }
  }
};
