import { fr } from "./i18n/fr";

const app = document.querySelector<HTMLElement>("#app");
if (app === null) {
  throw new Error("Élément #app introuvable dans la page.");
}

const title = document.createElement("h1");
title.textContent = fr.appTitle;

const tagline = document.createElement("p");
tagline.textContent = fr.appTagline;

const status = document.createElement("p");
status.textContent = fr.m0Status;

app.append(title, tagline, status);
