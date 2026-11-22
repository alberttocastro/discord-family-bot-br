export interface ShoppingItem {
  id: string;
  name: string;
  addedBy: string;
  addedAt: string;
  checked?: boolean;
  checkedAt?: string;
  checkedBy?: string;
}

export type FinishListAction = "keep" | "new_list_missing" | "return_to_stage";

export interface ShoppingList {
  id: string;
  name: string;
  status: "active" | "finished";
  createdAt: string;
  createdBy: string;
  items: ShoppingItem[];
  finishedAt?: string;
  finishAction?: FinishListAction;
}

export interface ShoppingData {
  stage: ShoppingItem[];
  activeList: ShoppingList | null;
  history: ShoppingList[];
}
