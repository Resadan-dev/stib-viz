import { startApp } from "./app";
import { fr } from "./i18n/fr";

const root = document.querySelector<HTMLElement>("#app");
if (root === null) {
  throw new Error("Missing #app element in the page.");
}

startApp(root, { search: window.location.search })
  .then((api) => {
    window.stibviz = api;
  })
  .catch((error: unknown) => {
    console.error(error);
    const message = document.createElement("p");
    message.className = "fatal";
    message.setAttribute("role", "alert");
    message.textContent = fr.dataError;
    root.append(message);
  });
