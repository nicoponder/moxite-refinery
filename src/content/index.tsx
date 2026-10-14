import { loadSettings } from "../state";
import { injections } from "./injections";
import { startInjector } from "./injector";

loadSettings();
startInjector(injections);
