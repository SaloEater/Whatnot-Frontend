import { FC, useEffect, useState } from "react";
import { MyOBSWebsocket } from "@/app/entity/my_obs_websocket";
import { ObsItem, ObsScene, RawObsItem } from "@/app/entity/entities";
import { Select, Switch, Spin } from "antd";
import { StepsComponent } from "@/app/component/stepsComponent";

interface ObjectsControlProps {
  obs: MyOBSWebsocket;
  obsScene: ObsScene;
}

interface SelectedItemsMap {
  [key: string]: RawObsItem | null;
}

export const ObjectsControl: FC<ObjectsControlProps> = ({ obs, obsScene }) => {
  const [sceneItems, setSceneItems] = useState<RawObsItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedItemsMap>({
    Board: null,
    BreakResults: null,
    WaitScreen: null,
  });
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    obs.getSceneItemList(obsScene).then((items) => {
      setSceneItems(items);
      setLoading(false);
    });
  }, [obs, obsScene]);

  const handleToggle = (label: string, isChecked: boolean) => {
    const item = selectedItems[label];
    if (item) {
      if (isChecked) {
        obs.showItem(obsScene, item).then(() => {
          setSelectedItems((prev) => ({
            ...prev,
            [label]: { ...item, isVisible: true },
          }));
        });
      } else {
        obs.hideItem(obsScene, item).then(() => {
          setSelectedItems((prev) => ({
            ...prev,
            [label]: { ...item, isVisible: false },
          }));
        });
      }
    }
  };

  const renderSelectionRow = (label: string) => (
    <div
      style={{ display: "flex", alignItems: "center", marginBottom: "10px" }}
    >
      <span style={{ marginRight: "10px" }}>{label}</span>
      <Select
        style={{ width: 200 }}
        placeholder="Select OBS object"
        onChange={(itemUuid) => {
          const item = sceneItems.find((i) => i.uuid === itemUuid) || null;
          setSelectedItems((prev) => ({ ...prev, [label]: item }));
        }}
        value={selectedItems[label]?.uuid || undefined}
      >
        {sceneItems.map((item) => (
          <Select.Option key={item.uuid} value={item.uuid}>
            {item.name}
          </Select.Option>
        ))}
      </Select>
    </div>
  );

  const renderControlRow = (label: string) => (
    <div
      style={{ display: "flex", alignItems: "center", marginBottom: "10px" }}
    >
      <span style={{ marginRight: "10px" }}>{label}</span>
      <Switch
        checked={selectedItems[label]?.isVisible || false}
        onChange={(isChecked) => handleToggle(label, isChecked)}
        disabled={!selectedItems[label]}
      />
    </div>
  );

  if (loading) return <Spin tip="Loading OBS objets..." />;

  return (
    <StepsComponent
      steps={[
        {
          name: "Object Selection",
          node: (
            <div>
              {renderSelectionRow("Board")}
              {renderSelectionRow("BreakResults")}
              {renderSelectionRow("WaitScreen")}
            </div>
          ),
        },
        {
          name: "Visibility Control",
          node: (
            <div>
              {renderControlRow("Board")}
              {renderControlRow("BreakResults")}
              {renderControlRow("WaitScreen")}
            </div>
          ),
        },
      ]}
    />
  );
};
