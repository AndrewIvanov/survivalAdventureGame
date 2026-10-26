import './styles.css';
import { Network } from './network.js';
import { createGame } from './game/scene.js';
import { Interface } from './ui.js';

const network = new Network();
const { game, scene } = createGame(network);
new Interface(network, scene, game);
if (import.meta.env.DEV && new URLSearchParams(location.search).has('profile')) import('./performance.js').then(m => m.showPerformance());
