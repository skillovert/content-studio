// Remotion entry for Content Studio's preview and thumbnail (bundled by render/render.mjs with
// the studio's node_modules, public folder and components).
import {registerRoot} from 'remotion';
import './brand'; // the creator's look first, before any scene module reads it
import {Root} from './Root';

registerRoot(Root);
