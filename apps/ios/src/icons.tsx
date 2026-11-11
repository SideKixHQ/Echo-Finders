/**
 * The web app's line icons, drawn the same way: 24 by 24, a 1.7 stroke, round ends.
 * The paths are the ones in `apps/prototype/src/Nav.tsx`, so the tab bars match.
 */
import type { ReactNode } from "react";
import type { ColorValue } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

interface IconProps {
  readonly color: ColorValue;
  readonly size?: number;
}

function Line({ color, size = 26, children }: IconProps & { children: ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

export function MapIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15" />
    </Line>
  );
}

export function EchoesIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M12 21.5s7-5.7 7-11.1A7 7 0 0 0 5 10.4c0 5.4 7 11.1 7 11.1z" />
      <Path d="M9 10.2l2.2 2.2L15 8.6" />
    </Line>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Line {...props}>
      <Path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <Circle cx="12" cy="12" r="3" />
    </Line>
  );
}

/** Filled play and pause, for the player. */
export function PlayIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M7 4.5v15l12.5-7.5z" />
    </Svg>
  );
}

export function PauseIcon({ color, size = 22 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M6.5 4h4v16h-4zM13.5 4h4v16h-4z" />
    </Svg>
  );
}

export function CloseIcon({ color, size = 16 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
      <Path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}
