import { loadSettings } from "../state";
import { trackGroupMenus } from "./groupMenu";
import { injections } from "./injections";
import { startInjector } from "./injector";

trackGroupMenus();
loadSettings();
startInjector(injections);
