/**
 * Custom slim Phaser build for this game.
 *
 * Based on Phaser's official `phaser-core` entry (which already excludes the
 * Arcade + Matter physics engines) and trimmed further via build flags (no
 * Sound, no WebGL debug, no experimental/3D/Facebook plugins — see
 * vite.config.js). The game uses none of those systems.
 *
 * The one thing `phaser-core` omits that this game *does* use is the Shape and
 * Container Game Objects (`add.rectangle/ellipse/circle/triangle/container`),
 * so we import their factory modules here to self-register them. Importing a
 * Factory module triggers `GameObjectFactory.register(...)` as a side effect.
 * We also add `Math.Clamp` and `Math.Distance`, used by the scene but absent
 * from stock `phaser-core`.
 *
 * Keep the imports in sync with the `scene.add.*` and `Phaser.*` usages in
 * src/game/visuals.js and src/game/scenes/MapScene.js.
 */

import 'phaser/src/polyfills/requestVideoFrame';

import CONST from 'phaser/src/const';
import Extend from 'phaser/src/utils/object/Extend';

import Animations from 'phaser/src/animations';
import BlendModes from 'phaser/src/renderer/BlendModes';
import Cache from 'phaser/src/cache';
import Cameras2D from 'phaser/src/cameras/2d';
import Core from 'phaser/src/core';
import Class from 'phaser/src/utils/Class';
import Data from 'phaser/src/data';
import Masks from 'phaser/src/display/mask';
import DOM from 'phaser/src/dom';
import Events from 'phaser/src/events';
import FX from 'phaser/src/fx';
import Game from 'phaser/src/core/Game';

import DisplayList from 'phaser/src/gameobjects/DisplayList';
import GameObjectCreator from 'phaser/src/gameobjects/GameObjectCreator';
import GameObjectFactory from 'phaser/src/gameobjects/GameObjectFactory';
import UpdateList from 'phaser/src/gameobjects/UpdateList';
import Components from 'phaser/src/gameobjects/components';
import BuildGameObject from 'phaser/src/gameobjects/BuildGameObject';
import BuildGameObjectAnimation from 'phaser/src/gameobjects/BuildGameObjectAnimation';
import GameObject from 'phaser/src/gameobjects/GameObject';
import Graphics from 'phaser/src/gameobjects/graphics/Graphics';
import Image from 'phaser/src/gameobjects/image/Image';
import Layer from 'phaser/src/gameobjects/layer/Layer';
import Sprite from 'phaser/src/gameobjects/sprite/Sprite';
import Text from 'phaser/src/gameobjects/text/Text';
// Shapes + Container used by this game's placeholder art.
import Container from 'phaser/src/gameobjects/container/Container';
import Shape from 'phaser/src/gameobjects/shape/Shape';
import Arc from 'phaser/src/gameobjects/shape/arc/Arc';
import Ellipse from 'phaser/src/gameobjects/shape/ellipse/Ellipse';
import Rectangle from 'phaser/src/gameobjects/shape/rectangle/Rectangle';
import Triangle from 'phaser/src/gameobjects/shape/triangle/Triangle';

// Factory/Creator modules have no exports — they self-register with
// GameObjectFactory/GameObjectCreator as an import side effect. Importing them
// for their side effect is what makes `scene.add.*` / `scene.make.*` work.
import 'phaser/src/gameobjects/graphics/GraphicsFactory';
import 'phaser/src/gameobjects/image/ImageFactory';
import 'phaser/src/gameobjects/layer/LayerFactory';
import 'phaser/src/gameobjects/sprite/SpriteFactory';
import 'phaser/src/gameobjects/text/TextFactory';
import 'phaser/src/gameobjects/container/ContainerFactory'; // registers 'container'
import 'phaser/src/gameobjects/shape/arc/ArcFactory'; // registers 'arc' + 'circle'
import 'phaser/src/gameobjects/shape/ellipse/EllipseFactory';
import 'phaser/src/gameobjects/shape/rectangle/RectangleFactory';
import 'phaser/src/gameobjects/shape/triangle/TriangleFactory';

import 'phaser/src/gameobjects/graphics/GraphicsCreator';
import 'phaser/src/gameobjects/image/ImageCreator';
import 'phaser/src/gameobjects/layer/LayerCreator';
import 'phaser/src/gameobjects/sprite/SpriteCreator';
import 'phaser/src/gameobjects/text/TextCreator';

import Input from 'phaser/src/input';

// Audio file types are omitted: sound is disabled (FEATURE_SOUND=false) and the
// game loads no assets. (AudioSpriteFile also has no default export anyway.)
import AnimationJSONFile from 'phaser/src/loader/filetypes/AnimationJSONFile';
import AtlasJSONFile from 'phaser/src/loader/filetypes/AtlasJSONFile';
import ImageFile from 'phaser/src/loader/filetypes/ImageFile';
import JSONFile from 'phaser/src/loader/filetypes/JSONFile';
import MultiAtlasFile from 'phaser/src/loader/filetypes/MultiAtlasFile';
import PluginFile from 'phaser/src/loader/filetypes/PluginFile';
import ScriptFile from 'phaser/src/loader/filetypes/ScriptFile';
import SpriteSheetFile from 'phaser/src/loader/filetypes/SpriteSheetFile';
import TextFile from 'phaser/src/loader/filetypes/TextFile';
import XMLFile from 'phaser/src/loader/filetypes/XMLFile';
import File from 'phaser/src/loader/File';
import FileTypesManager from 'phaser/src/loader/FileTypesManager';
import GetURL from 'phaser/src/loader/GetURL';
import LoaderPlugin from 'phaser/src/loader/LoaderPlugin';
import MergeXHRSettings from 'phaser/src/loader/MergeXHRSettings';
import MultiFile from 'phaser/src/loader/MultiFile';
import XHRLoader from 'phaser/src/loader/XHRLoader';
import XHRSettings from 'phaser/src/loader/XHRSettings';

import Between from 'phaser/src/math/Between';
import Clamp from 'phaser/src/math/Clamp';
import DegToRad from 'phaser/src/math/DegToRad';
import Distance from 'phaser/src/math/distance';
import FloatBetween from 'phaser/src/math/FloatBetween';
import RadToDeg from 'phaser/src/math/RadToDeg';
import Vector2 from 'phaser/src/math/Vector2';

import Plugins from 'phaser/src/plugins';
import Renderer from 'phaser/src/renderer';
import Scale from 'phaser/src/scale';
import ScaleModes from 'phaser/src/renderer/ScaleModes';
import Scene from 'phaser/src/scene/Scene';
import Scenes from 'phaser/src/scene';
import Structs from 'phaser/src/structs';
import Textures from 'phaser/src/textures';
import Time from 'phaser/src/time';
import Tweens from 'phaser/src/tweens';

let Phaser = {
  Animations,
  BlendModes,
  Cache,
  Cameras: { Scene2D: Cameras2D },
  Core,
  Class,
  Data,
  Display: { Masks },
  DOM,
  Events,
  FX,
  Game,
  GameObjects: {
    DisplayList,
    GameObjectCreator,
    GameObjectFactory,
    UpdateList,
    Components,
    BuildGameObject,
    BuildGameObjectAnimation,
    GameObject,
    Graphics,
    Image,
    Layer,
    Sprite,
    Text,
    Container,
    Shape,
    Arc,
    Ellipse,
    Rectangle,
    Triangle,
  },
  Input,
  Loader: {
    FileTypes: {
      AnimationJSONFile,
      AtlasJSONFile,
      ImageFile,
      JSONFile,
      MultiAtlasFile,
      PluginFile,
      ScriptFile,
      SpriteSheetFile,
      TextFile,
      XMLFile,
    },
    File,
    FileTypesManager,
    GetURL,
    LoaderPlugin,
    MergeXHRSettings,
    MultiFile,
    XHRLoader,
    XHRSettings,
  },
  Math: {
    Between,
    Clamp,
    DegToRad,
    Distance,
    FloatBetween,
    RadToDeg,
    Vector2,
  },
  Plugins,
  Renderer,
  Scale,
  ScaleModes,
  Scene,
  Scenes,
  Structs,
  Textures,
  Time,
  Tweens,
};

Phaser = Extend(false, Phaser, CONST);

export default Phaser;
