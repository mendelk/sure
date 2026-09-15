export type SpaBootstrap = {
  currentUser: {
    id: string;
    name: string;
  };
  railsPaths: {
    home: string;
  };
};

export function readSpaBootstrap(): SpaBootstrap {
  const element = document.querySelector<HTMLScriptElement>("#spa-bootstrap");

  if (!element?.textContent) {
    throw new Error("SPA bootstrap data is missing");
  }

  return JSON.parse(element.textContent) as SpaBootstrap;
}
