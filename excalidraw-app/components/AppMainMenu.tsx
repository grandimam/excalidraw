import { MainMenu } from "@excalidraw/excalidraw/index";
import React from "react";

export const AppMainMenu: React.FC = React.memo(() => {
  return (
    <MainMenu>
      <MainMenu.DefaultItems.LoadScene />
      <MainMenu.DefaultItems.SaveToActiveFile />
      <MainMenu.DefaultItems.Export />
      <MainMenu.DefaultItems.SaveAsImage />
    </MainMenu>
  );
});
