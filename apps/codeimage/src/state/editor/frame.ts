import {
  clampFrameMinSize,
  clampFrameSize,
  coercePersistedFrameSize,
  MAX_FRAME_HEIGHT,
  MAX_FRAME_MIN_HEIGHT,
  MAX_FRAME_MIN_WIDTH,
  MAX_FRAME_WIDTH,
  MIN_FRAME_HEIGHT,
  MIN_FRAME_WIDTH,
  type FrameState,
  type PersistedFrameState,
} from '@codeimage/store/frame/model';
import {provideAppState} from '@codeimage/store/index';
import type {PresetData} from '@codeimage/store/presets/types';
import {appEnvironment} from '@core/configuration';
import {from, map} from 'rxjs';
import {defineStore} from 'statebuilder';
import {withProxyCommands} from 'statebuilder/commands';

export function getInitialFrameState(): FrameState {
  return {
    // lazy initialization
    background: null,
    padding: 64,
    radius: 8,
    visible: true,
    opacity: 100,
    // Both axes start content-driven; explicit width/height only apply once the
    // user drags a handle or types a value (which flips the matching auto flag).
    autoWidth: true,
    autoHeight: true,
    scale: 1,
    // Transient UI flag (never persisted): `true` while the user is dragging a
    // resize handle. Read by FrameHandler to FREEZE the zoom-to-fit scale for the
    // gesture and disable the eased refit transition, so the frame follows the
    // cursor without the refit fighting it. Reset to `false` on drag end.
    resizing: false,
    width: 0,
    height: 0,
    aspectRatio: null,
    minWidth: 0,
    minHeight: 0,
  };
}

type Commands = {
  setBackground: string;
  setOpacity: number;
  setPadding: number;
  setRadius: number;
  setScale: number;
  setResizing: boolean;
  setAutoWidth: boolean;
  setAutoHeight: boolean;
  setMinWidth: number;
  setMinHeight: number;
  setWidth: number;
  setHeight: number;
  setVisibility: boolean;
  toggleVisibility: void;
  setNextPadding: void;
  setFromPreset: PresetData['frame'];
  setFromPersistedState: PersistedFrameState;
  setAspectRatio: string | null;
};

const frameState = defineStore(() => getInitialFrameState())
  .extend(withProxyCommands<Commands>())
  .extend(store => {
    store
      .hold(store.commands.setBackground, (background, {state}) => ({
        ...state,
        background,
      }))
      .hold(store.commands.setOpacity, (opacity, {state}) => ({
        ...state,
        opacity,
      }))
      .hold(store.commands.setPadding, (padding, {state}) => ({
        ...state,
        padding,
      }))
      .hold(store.commands.setRadius, (radius, {state}) => ({
        ...state,
        radius,
      }))
      .hold(store.commands.setScale, (scale, {state}) => ({
        ...state,
        scale,
      }))
      // Transient — deliberately NOT in the persist watch list below, so toggling
      // it during a drag never writes to storage.
      .hold(store.commands.setResizing, (resizing, {state}) => ({
        ...state,
        resizing,
      }))
      .hold(store.commands.setAutoWidth, (autoWidth, {state}) => ({
        ...state,
        autoWidth,
      }))
      .hold(store.commands.setAutoHeight, (autoHeight, {state}) => ({
        ...state,
        autoHeight,
      }))
      .hold(store.commands.setMinWidth, (minWidth, {state}) => ({
        ...state,
        minWidth: clampFrameMinSize(minWidth, MAX_FRAME_MIN_WIDTH),
      }))
      .hold(store.commands.setMinHeight, (minHeight, {state}) => ({
        ...state,
        minHeight: clampFrameMinSize(minHeight, MAX_FRAME_MIN_HEIGHT),
      }))
      .hold(store.commands.setVisibility, (visible, {state}) => ({
        ...state,
        visible,
      }))
      .hold(store.commands.toggleVisibility, (_, {state}) => ({
        ...state,
        visible: !state.visible,
      }))
      // Setting an explicit width/height is a user intent ("size this axis"), so
      // it clamps into the allowed range AND turns the matching auto flag off.
      // The passive resize-observer measurement path uses a different entry point
      // (see Frame.tsx) so it never flips auto off on its own.
      .hold(store.commands.setWidth, (width, {state}) => ({
        ...state,
        width: clampFrameSize(width, MIN_FRAME_WIDTH, MAX_FRAME_WIDTH),
        autoWidth: false,
      }))
      .hold(store.commands.setHeight, (height, {state}) => ({
        ...state,
        height: clampFrameSize(height, MIN_FRAME_HEIGHT, MAX_FRAME_HEIGHT),
        autoHeight: false,
      }))
      .hold(store.commands.setNextPadding, (_, {state}) => {
        const availablePadding = appEnvironment.editorPadding;
        const padding = state.padding;
        const currentIndex = appEnvironment.editorPadding.findIndex(
          item => Number(item.value) === padding,
        );
        const next = (currentIndex + 1) % availablePadding.length;
        return {...state, padding: Number(availablePadding[next].value)};
      })
      .hold(store.commands.setFromPreset, presetData => {
        store.set(state => ({...state, ...presetData}));
      })
      .hold(store.commands.setFromPersistedState, (_, {state}) => {
        // Old persisted slides predate min-size (pre-v2) and explicit width/height
        // (pre-v5). `coercePersistedFrameSize` fills absent fields: min-size -> 0
        // (off), autoWidth/autoHeight -> true (content-driven), width/height -> 0,
        // so hydrating older data reproduces the historical content-driven box.
        return {
          ...state,
          ...coercePersistedFrameSize(_),
        };
      })
      .hold(store.commands.setAspectRatio, (aspectRatio, {state}) => {
        return {...state, aspectRatio};
      });
  })
  .extend(store => {
    const mapToStateToPersistState = (
      state: FrameState,
    ): PersistedFrameState => {
      return {
        background: state.background,
        opacity: state.opacity,
        padding: state.padding,
        visible: state.visible,
        radius: state.radius,
        minWidth: state.minWidth ?? 0,
        minHeight: state.minHeight ?? 0,
        autoWidth: state.autoWidth ?? true,
        autoHeight: state.autoHeight ?? true,
        width: state.width ?? 0,
        height: state.height ?? 0,
      } as PersistedFrameState;
    };

    const stateToPersist$ = from(
      store.watchCommand([
        store.commands.setBackground,
        store.commands.setOpacity,
        store.commands.setPadding,
        store.commands.setRadius,
        store.commands.setScale,
        store.commands.setAutoWidth,
        store.commands.setAutoHeight,
        store.commands.setWidth,
        store.commands.setHeight,
        store.commands.setMinWidth,
        store.commands.setMinHeight,
        store.commands.setVisibility,
        store.commands.setNextPadding,
        store.commands.setFromPreset,
      ]),
    ).pipe(
      map(() => store()),
      map(mapToStateToPersistState),
    );

    return {
      get store() {
        return store.get;
      },
      setStore: store.set,
      stateToPersist$,
      stateToPersist() {
        const state = store();
        return mapToStateToPersistState(state);
      },
      ...store.actions,
    };
  });

export function getFrameState() {
  return provideAppState(frameState);
}
