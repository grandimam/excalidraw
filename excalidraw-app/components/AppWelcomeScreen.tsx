import { WelcomeScreen } from "@excalidraw/excalidraw/index";
import React from "react";

export const AppWelcomeScreen: React.FC = React.memo(() => {
  return (
    <WelcomeScreen>
      <WelcomeScreen.Hints.ToolbarHint />
      <WelcomeScreen.Center>
        <WelcomeScreen.Center.Logo />
        <WelcomeScreen.Center.Heading>
          Start drawing your system design
        </WelcomeScreen.Center.Heading>
        <WelcomeScreen.Center.Menu>
          <WelcomeScreen.Center.MenuItemLoadScene />
        </WelcomeScreen.Center.Menu>
      </WelcomeScreen.Center>
    </WelcomeScreen>
  );
});
