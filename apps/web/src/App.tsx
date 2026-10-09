import {ConsumptionFields} from "./ConsumptionFields.js";
import type {Home, SetupStatus} from "./webTypes.js";
import { AvatarIcon,BrandWordmark,TransactionRow,UnitOptions } from "./AppElements.js";
import { Login,Setup } from "./AuthScreens.js";
import { DashboardPage } from "./DashboardPage.js";
import { EditShoppingDialog } from "./EditShoppingDialog.js";
import { FinancePage } from "./FinancePage.js";
import { HierarchyManager } from "./HierarchyManager.js";
import { IconPicker,itemIconFor,MaterialIcon } from "./Icons.js";
import { InventoryPage } from "./InventoryPage.js";
import { ItemForm } from "./ItemForm.js";
import { ProfileHomeSettings,ProfileLogout,ProfileTokens,ProfileUserSettings } from "./ProfilePage.js";
import { ReceiveShoppingDialog } from "./ReceiveShoppingDialog.js";
import { ShoppingForm } from "./ShoppingForm.js";
import { ShoppingPage } from "./ShoppingPage.js";
import { StockDialog } from "./StockDialog.js";
import {TransferDialog,LocationStocktake,OperationHistoryDialog} from "./InventoryWorkflows.js";
import { TransactionPagination } from "./TransactionPagination.js";
import { getCategories,getFinancialSummary,getHomeId,getItems,getLocations,getOpenedConsumables,getShoppingCalendar,getShoppingChannels,getShoppingList,getStock,getTransactions } from "./apiClient.js";
import { formatMoney } from "./formatMoney.js";
import { roundQuantity } from "./quantity.js";
import { apiFetch,apiJson } from "./i18n/apiFetch.js";
import i18n,{
displayUnit,
localeForDates
} from "./i18n/index.js";
import { itemDetailIdFromUrl,itemDetailSourcePage,pageFromUrl,pagePaths,stocktakeFromHash,type Page } from "./navigation.js";
import "./treeDrag.css";
import type { ApiToken,Category,CurrentUser,FinancialSummary,Item,Location,LocationScopedItem,OpenedConsumable,ShoppingChannel,ShoppingItem,Stock,Transaction,UserAvatar } from "./webTypes.js";
const t = i18n.t.bind(i18n);

import {
CalendarClock,
Check,
ChevronDown,
ChevronRight,
CircleMinus,
ClipboardList,
Package,
Pencil,
Plus,
Search,
ShoppingCart,
Trash2,
TriangleAlert,
Wallet,
X
} from "lucide-react";
import {
FormEvent,
useEffect,
useLayoutEffect,
useMemo,
useRef,
useState,
type CSSProperties,
type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { BarcodeScanner } from "./BarcodeScanner.js";
import { Batches } from "./Batches.js";
import { ItemDetail } from "./ItemDetail.js";
import { budgetAllocations,completeBudgetTree,setBudgetAllocation } from "./budgetTree.js";
import { descendantIds,flattenHierarchy,summarizeHierarchy } from "./hierarchy.js";
import { categoryLabel,channelLabel } from "./systemLabels.js";

const locationId = "22222222-2222-4222-8222-222222222222";

const newIdempotencyKey = () =>
  globalThis.crypto?.randomUUID?.() ??
  `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function App() {
  const { i18n: activeI18n } = useTranslation();
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [currentUser,setCurrentUser]=useState<CurrentUser|null>(null);
  const [homes, setHomes] = useState<
    { id: string; name: string; icon?: string;defaultCurrency?:string }[]
  >([]);
  const homeReady = homes.some((home) => home.id === getHomeId());
  const [homeNotice, setHomeNotice] = useState("");
  const [passwordNotice, setPasswordNotice] = useState("");
  const [editingHome, setEditingHome] = useState<Home | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [openedConsumables,setOpenedConsumables]=useState<OpenedConsumable[]>([]);
  const [exhaustTarget,setExhaustTarget]=useState<OpenedConsumable|null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "item" | "category" | "location";
    id: string;
    name: string;
    message: string;
  } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stockAction, setStockAction] = useState<{
    type: "receipt" | "issue";
    item: Item;
  } | null>(null);
  const [stockLocationId, setStockLocationId] = useState("");
  const [stockTargetLocationId,setStockTargetLocationId]=useState("");
  const [stockOperationKey, setStockOperationKey] = useState("");
  const [workflowDialog,setWorkflowDialog]=useState<"transfer"|"history"|null>(null);
  const [stocktakeScope,setStocktakeScope]=useState<{kind:"location";node:Location}|{kind:"category";node:Category}|null>(null);
  const [stocktakeHashVersion,setStocktakeHashVersion]=useState(0);
  const [workflowItem,setWorkflowItem]=useState<Item|null>(null);
  const [showHomeIssuePicker,setShowHomeIssuePicker]=useState(false);
  const [homeIssueQuery,setHomeIssueQuery]=useState("");
  const [page, setPage] = useState(1);
  const [pageSize,setPageSize]=useState(10);
  const [transactionPageSize,setTransactionPageSize]=useState(10);
  const [locationFilter, setLocationFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockStatusFilter, setStockStatusFilter] = useState("");
  const [expiryFilter, setExpiryFilter] = useState("");
  const [inventorySort, setInventorySort] = useState<"urgency"|"recent">("urgency");
  const [detailItem, setDetailItem] = useState<Item | null>(null);
  const [prefillLocationId, setPrefillLocationId] = useState("");
  const [prefillCategory, setPrefillCategory] = useState("");
  const [prefillName, setPrefillName] = useState("");
  const [prefillUnit, setPrefillUnit] = useState("个");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const [barcodeNotice, setBarcodeNotice] = useState("");
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [itemFormRevision, setItemFormRevision] = useState(0);
  const [itemFormError, setItemFormError] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryParent, setCategoryParent] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationParent, setLocationParent] = useState("");
  const [editTreeNode, setEditTreeNode] = useState<{
    kind: "location" | "category";
    id: string;
    name: string;
    parentId: string | null;
  } | null>(null);
  const [transactionPage, setTransactionPage] = useState(1);
  const [transactionTotal, setTransactionTotal] = useState(0);
  const [transactionSnapshot, setTransactionSnapshot] = useState("");
  const [batchItem, setBatchItem] = useState<Item | null>(null);
  const [initialBatchId, setInitialBatchId] = useState<string | null>(null);
  const [batchRevision, setBatchRevision] = useState(0);
  const [activePage, setActivePage] = useState<Page>(()=>itemDetailIdFromUrl()?itemDetailSourcePage()??"count":pageFromUrl());
  const [itemDetailId,setItemDetailId]=useState<string|null>(itemDetailIdFromUrl);
  const countView = activePage === "locations" || activePage === "categories";
  const treeMode = activePage === "categories" ? "category" : "location";
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([]);
  const [newApiToken, setNewApiToken] = useState("");
  const [expandedLocations, setExpandedLocations] = useState<
    Record<string, boolean>
  >({});
  const [draggedTreeItem,setDraggedTreeItem]=useState<{item:LocationScopedItem;sourceNodeId:string|null}|null>(null);
  const [treeDropTarget,setTreeDropTarget]=useState<string|null>(null);
  const [treeMoving,setTreeMoving]=useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [mobileAction,setMobileAction]=useState<{kind:"shopping";item:ShoppingItem}|{kind:"inventory";item:LocationScopedItem}|null>(null);
  const [shoppingChannels, setShoppingChannels] = useState<ShoppingChannel[]>(
    [],
  );
  const [shoppingMonth, setShoppingMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [calendarItems, setCalendarItems] = useState<ShoppingItem[]>([]);
  const [calendarIncludeCompleted, setCalendarIncludeCompleted] =
    useState(false);
  const [selectedShoppingDate, setSelectedShoppingDate] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [financialSummary,setFinancialSummary]=useState<FinancialSummary|null>(null);
  const [calendarFinancial,setCalendarFinancial]=useState<FinancialSummary|null>(null);
  const [financeMonth,setFinanceMonth]=useState(() => new Date().toISOString().slice(0,7));
  const [financeDashboard,setFinanceDashboard]=useState<FinancialSummary|null>(null);
  const [financeSaving,setFinanceSaving]=useState(false);
  const [financeBudgetTotal,setFinanceBudgetTotal]=useState("");
  const [financeBudgetEntries,setFinanceBudgetEntries]=useState<{category:string;amount:string}[]>([]);
  const [financeCategorySelection,setFinanceCategorySelection]=useState("");
  const [financeCategoryAmount,setFinanceCategoryAmount]=useState("");
  const financeFlowRef=useRef<HTMLDivElement>(null);
  const financeBudgetOriginRef=useRef<HTMLDivElement>(null);
  const financeBudgetListRef=useRef<HTMLDivElement>(null);
  const financeBudgetEntryRefs=useRef<Record<string,HTMLDivElement|null>>({});
  const [financeBudgetLinks,setFinanceBudgetLinks]=useState<{fromX:number;fromY:number;toX:number;toY:number}[]>([]);
  const [financeFlowSize,setFinanceFlowSize]=useState({width:0,height:0});
  const [showShoppingForm, setShowShoppingForm] = useState(false);
  const [shoppingItemId, setShoppingItemId] = useState("");
  const [editShoppingItemId, setEditShoppingItemId] = useState("");
  const [editShoppingItem, setEditShoppingItem] = useState<ShoppingItem | null>(
    null,
  );
  const [receiveShoppingItem, setReceiveShoppingItem] =
    useState<ShoppingItem | null>(null);
  const [receiveQuantity,setReceiveQuantity]=useState("");
  const [receiveTotal,setReceiveTotal]=useState("");
  const [receiveCompletion,setReceiveCompletion]=useState<"keep"|"complete">("complete");
  const receiveUnitPrice=receiveTotal.trim()!==""&&Number.isFinite(Number(receiveTotal))&&Number(receiveTotal)>=0&&Number.isFinite(Number(receiveQuantity))&&Number(receiveQuantity)>0?Number(receiveTotal)/Number(receiveQuantity):null;
  const [receiveOperationKey, setReceiveOperationKey] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const itemCategories = categories.length
    ? categories.map((category) => category.name)
    : [
        "食品",
        "饮品",
        "日用品",
        "药品与健康",
        "衣物",
        "工具",
        "电器",
        "文具",
        "宠物用品",
        "其他",
      ];
  const [logView, setLogView] = useState(false);
  const calendarCompletedPreferenceKey=(homeId:string)=>`al1s-wms-calendar-include-completed:${homeId}`;
  const updateCalendarIncludeCompleted=(value:boolean)=>{
    setCalendarIncludeCompleted(value);
    localStorage.setItem(calendarCompletedPreferenceKey(getHomeId()),String(value));
  };
  useEffect(() => {
    const onPopState = () => {const itemId=itemDetailIdFromUrl();setActivePage(itemId?itemDetailSourcePage()??"count":pageFromUrl());setItemDetailId(itemId);setStocktakeHashVersion(value=>value+1);};
    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onPopState);
    return () => {window.removeEventListener("popstate", onPopState);window.removeEventListener("hashchange", onPopState);};
  }, []);
  useEffect(() => {
    setLogView(false);
    setShowForm(false);
    setStockAction(null);
    setWorkflowDialog(null);
    setWorkflowItem(null);
    setStocktakeScope(null);
    setExhaustTarget(null);
    setDetailItem(null);
    setEditTreeNode(null);
    setDraggedTreeItem(null);
    setTreeDropTarget(null);
    setShowShoppingForm(false);
    setEditShoppingItem(null);
    setReceiveShoppingItem(null);
    setEditingHome(null);
    if (authenticated && activePage === "profile") loadApiTokens();
  }, [activePage, authenticated]);
  useEffect(()=>{
    const target=stocktakeFromHash();
    const node=target?.kind==="location"?locations.find(row=>row.id===target.id):categories.find(row=>row.id===target?.id);
    if(target&&node&&(target.kind==="location"?(activePage==="locations"||activePage==="count"):activePage==="categories")){
      setStocktakeScope(target.kind==="location"?{kind:"location",node:node as Location}:{kind:"category",node:node as Category});
      setExpandedLocations(previous=>({...previous,[target.id]:true}));
    }else setStocktakeScope(null);
  },[activePage,locations,categories,stocktakeHashVersion]);
  const linkedShoppingItem = items.find((item) => item.id === shoppingItemId);
  const linkedEditShoppingItem = items.find(
    (item) => item.id === editShoppingItemId,
  );
  const shoppingChannelName = (item: ShoppingItem) => {
    const name = shoppingChannels.find((channel) => channel.id === item.channelId)?.name;
    return name ? channelLabel(name) : t("未指定");
  };
  const transactionPageCount = Math.max(1, Math.ceil(transactionTotal / transactionPageSize));
  const pagedTransactions = transactions;
  useEffect(() => {
    if (transactionPage > transactionPageCount)
      setTransactionPage(transactionPageCount);
  }, [transactionPage, transactionPageCount]);
  useEffect(() => {
    if (!authenticated || !homeReady) return;
    getTransactions(
      transactionPage,
      transactionPage === 1 ? "" : transactionSnapshot,
      transactionPageSize,
    )
      .then((next) => {
        setTransactions(next.items);
        setTransactionTotal(next.total);
        if (transactionPage === 1) setTransactionSnapshot(next.snapshotAt);
      })
      .catch((error) => setNotice(error.message));
  }, [authenticated, homeReady, transactionPage, transactionPageSize]);

  const load = () =>
    Promise.all([
      getItems(),
      getStock(),
      getOpenedConsumables(),
      getLocations(),
      getTransactions(
        transactionPage,
        transactionPage === 1 ? "" : transactionSnapshot,
        transactionPageSize,
      ),
      getShoppingList(),
      getCategories(),
      getShoppingChannels(),
      getFinancialSummary(new Date().toISOString().slice(0,7)),
    ])
      .then(
        ([
          nextItems,
          nextStock,
          nextOpenedConsumables,
          nextLocations,
          nextTransactions,
          nextShoppingList,
          nextCategories,
          nextShoppingChannels,
          nextFinancialSummary,
        ]) => {
          setItems(nextItems);
          setStock(nextStock);
          setOpenedConsumables(nextOpenedConsumables);
          setLocations(nextLocations);
          setTransactions(nextTransactions.items);
          setTransactionTotal(nextTransactions.total);
          if (transactionPage === 1)
            setTransactionSnapshot(nextTransactions.snapshotAt);
          setShoppingList(nextShoppingList);
          setCategories(nextCategories);
          setShoppingChannels(nextShoppingChannels);
          setFinancialSummary(nextFinancialSummary);
        },
      )
      .catch((error) => setNotice(error.message));
  useEffect(() => {
    if (!authenticated || !homeReady) return;
    getShoppingCalendar(shoppingMonth, calendarIncludeCompleted)
      .then(setCalendarItems)
      .catch((error) => setNotice(error.message));
    getFinancialSummary(shoppingMonth).then(setCalendarFinancial).catch(error=>setNotice(error.message));
  }, [authenticated, homeReady, shoppingMonth, calendarIncludeCompleted, shoppingList]);
  useEffect(() => {
    if (!authenticated || !homeReady || activePage !== "finance") return;
    getFinancialSummary(financeMonth).then(data=>{
      setFinanceDashboard(data);
      setFinanceBudgetTotal(data.budgetTotal?.toString()??"");
      setFinanceBudgetEntries(data.categoryBudgets.map(budget=>({category:budget.category,amount:budget.amount.toFixed(2)})));
      setFinanceCategorySelection("");
      setFinanceCategoryAmount("");
    }).catch(error=>setNotice(error.message));
  }, [authenticated, homeReady, activePage, financeMonth]);
  useLayoutEffect(() => {
    if (activePage !== "finance" || !financeDashboard) return;
    const updateLinks=()=>{
      const flow=financeFlowRef.current,origin=financeBudgetOriginRef.current;
      if(!flow||!origin)return;
      const flowRect=flow.getBoundingClientRect(),originRect=origin.getBoundingClientRect();
      const links=budgetAllocations(categories,financeBudgetEntries).rows.flatMap(entry=>{
        if(entry.parent)return [];
        const target=financeBudgetEntryRefs.current[entry.category];
        if(!target)return [];
        const targetRect=target.getBoundingClientRect();
        return [{fromX:originRect.right-flowRect.left,fromY:originRect.top+originRect.height/2-flowRect.top,toX:targetRect.left-flowRect.left,toY:targetRect.top+targetRect.height/2-flowRect.top}];
      });
      setFinanceFlowSize({width:flowRect.width,height:flowRect.height});
      setFinanceBudgetLinks(links);
    };
    const frame=requestAnimationFrame(updateLinks);
    const observer=new ResizeObserver(updateLinks);
    for(const element of [financeFlowRef.current,financeBudgetOriginRef.current,financeBudgetListRef.current])if(element)observer.observe(element);
    window.addEventListener("resize",updateLinks);
    financeBudgetListRef.current?.addEventListener("scroll",updateLinks);
    return ()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener("resize",updateLinks);financeBudgetListRef.current?.removeEventListener("scroll",updateLinks);};
  },[activePage,financeDashboard,financeBudgetEntries,categories]);
  useEffect(() => {
    apiFetch("/api/v1/setup/status")
      .then((response) => response.json())
      .then((data) => {
        setSetup(data);
        if (data.complete)
          apiFetch("/api/v1/auth/me").then(async(response) => {
            setAuthenticated(response.ok);
            if(response.ok)setCurrentUser(await response.json() as CurrentUser);
          });
      })
      .catch(() => setSetup({ complete: false }));
  }, []);
  useEffect(()=>{
    if(!authenticated||currentUser)return;
    apiFetch("/api/v1/auth/me").then(async response=>{
      if(response.ok)setCurrentUser(await response.json() as CurrentUser);
    }).catch(()=>undefined);
  },[authenticated,currentUser]);
  useEffect(() => {
    if (!authenticated) return;
    apiFetch("/api/v1/homes")
      .then(async (response) => {
        if (!response.ok) throw new Error(t("无法加载家庭列表"));
        const available = (await response.json()) as typeof homes;
        const current =
          available.find((home) => home.id === getHomeId()) ?? available[0];
        setHomes(available);
        if (current) {
          localStorage.setItem("al1s-wms-home-id", current.id);
          setCalendarIncludeCompleted(localStorage.getItem(calendarCompletedPreferenceKey(current.id)) === "true");
          setSetup({ complete: true, home: current });
          await load();
        }
      })
      .catch((error) => setNotice(error.message));
  }, [authenticated]);
  const balanceFor = (itemId: string) =>
    roundQuantity(stock
      .filter((row) => row.itemId === itemId)
      .reduce((total, row) => total + row.quantity, 0));
  const locationScopedItems=useMemo(()=>items.flatMap(item=>{
    const balances=stock.filter(row=>row.itemId===item.id&&row.quantity>1e-9);
    if(balances.length)return balances.map(row=>({
      ...item,locationId:row.locationId,
      locationName:locations.find(location=>location.id===row.locationId)?.name??"未指定",
      treeQuantity:roundQuantity(row.quantity),
      latestReceivedAt:row.latestReceivedAt??null,
    }));
    return [{...item,treeQuantity:0}];
  }),[items,stock,locations]);
  async function toggleReplenishment(item: Item) {
    if (busy) return;
    setBusy(true);
    try {
      const response=await apiJson(`/api/v1/homes/${getHomeId()}/items/${item.id}`,"PATCH",{replenishmentPaused:!item.replenishmentPaused});
      if (!response.ok) throw new Error(t("补货设置保存失败"));
      await load();
      setBatchRevision(value=>value+1);
    } catch (error) { setNotice(error instanceof Error ? error.message : t("补货设置保存失败")); }
    finally { setBusy(false); }
  }
  const replenishmentFor = (item: Item) =>
    item.replenishmentPaused ? 0 : Math.max(roundQuantity(item.reorderPoint - balanceFor(item.id)), 0);
  const stockStatusFor = (item: Item) => {
    const quantity = balanceFor(item.id);
    const difference = roundQuantity(quantity - item.reorderPoint);
    if (item.replenishmentPaused) return { level: quantity === 0 ? "empty" : "paused", label: t("停购"), priority: quantity === 0 ? 4 : 3 };
    if (!item.replenishmentPaused && difference < 0)
      return {
        level: "low",
        label: t("不足"),
        priority: 0,
      };
    if (quantity === 0)
      return { level: "empty", label: t("耗尽"), priority: 2 };
    if (!item.replenishmentPaused && difference === 0)
      return { level: "warning", label: t("临界"), priority: 1 };
    return { level: "normal", label: t("正常"), priority: 3 };
  };
  const expiryStatusFor = (item: Item) => {
    if (!item.expiryDate) return { level: "none", label: t("未设") };
    const today = new Date().toISOString().slice(0, 10);
    const threshold = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .slice(0, 10);
    if (item.expiryDate < today) return { level: "expired", label: t("过期") };
    if (item.expiryDate <= threshold)
      return { level: "expiring", label: t("临期") };
    return { level: "valid", label: t("有效") };
  };
  const displayStatusFor = (item: Item) => {
    if (item.replenishmentPaused && balanceFor(item.id) === 0) return stockStatusFor(item);
    const expiry = expiryStatusFor(item);
    if (expiry.level === "expired") return { ...expiry, label: item.replenishmentPaused ? `${expiry.label} · ${t("停购")}` : expiry.label, priority: -2 };
    if (expiry.level === "expiring") return { ...expiry, label: item.replenishmentPaused ? `${expiry.label} · ${t("停购")}` : expiry.label, priority: -1 };
    return stockStatusFor(item);
  };
  const locationScopeIds = useMemo(() => {
    if (!locationFilter) return null;
    return descendantIds(locations,[locationFilter]);
  }, [locations, locationFilter]);
  const categoryScopeNames = useMemo(() => {
    if (!categoryFilter) return null;
    const ids = descendantIds(categories,categories
      .filter(category=>category.name===categoryFilter)
      .map(category=>category.id));
    return new Set(
      categories
        .filter((category) => ids.has(category.id))
        .map((category) => category.name),
    );
  }, [categories, categoryFilter]);
  const filtered = useMemo(
    () =>
      locationScopedItems
        .filter((item) => {
          if (
            !`${item.name} ${item.sku}`
              .toLowerCase()
              .includes(query.toLowerCase())
          )
            return false;
          if (
            locationScopeIds &&
            (!item.locationId || !locationScopeIds.has(item.locationId))
          )
            return false;
          if (categoryScopeNames && !categoryScopeNames.has(item.category))
            return false;
          if (stockStatusFilter === "paused" && !item.replenishmentPaused) return false;
          if (
            stockStatusFilter === "replenishment" &&
            replenishmentFor(item) <= 0
          )
            return false;
          if (
            stockStatusFilter &&
            stockStatusFilter !== "replenishment" && stockStatusFilter !== "paused" &&
            stockStatusFor(item).level !== stockStatusFilter
          )
            return false;
          if (expiryFilter && expiryStatusFor(item).level !== expiryFilter)
            return false;
          return true;
        })
        .sort((left,right)=>Number(Boolean(left.replenishmentPaused) && balanceFor(left.id)===0)-Number(Boolean(right.replenishmentPaused) && balanceFor(right.id)===0) || (inventorySort==="recent"
          ? (right.latestReceivedAt??"").localeCompare(left.latestReceivedAt??"") || displayStatusFor(left).priority-displayStatusFor(right).priority || left.name.localeCompare(right.name,localeForDates())
          : displayStatusFor(left).priority-displayStatusFor(right).priority || replenishmentFor(right)-replenishmentFor(left) || left.name.localeCompare(right.name,localeForDates()))),
    [
      locationScopedItems,
      query,
      locationScopeIds,
      categoryScopeNames,
      stockStatusFilter,
      expiryFilter,
      inventorySort,
      stock,
      activeI18n.resolvedLanguage,
    ],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageStart = filtered.length ? (page - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(page * pageSize, filtered.length);
  useEffect(() => {
    setPage(1);
  }, [query, locationFilter, categoryFilter, stockStatusFilter, expiryFilter, inventorySort]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const lowStockItems = items.filter((item) => replenishmentFor(item) > 0);
  const lowStock = lowStockItems.length;
  const expiringItems = items.filter(
    (item) => expiryStatusFor(item).level === "expiring",
  );
  const emptyStockCount = items.filter(
    (item) => stockStatusFor(item).level === "empty",
  ).length;
  const belowStockCount = lowStock;
  const criticalStockCount = items.filter(
    (item) => stockStatusFor(item).level === "warning",
  ).length;
  const pendingShopping = shoppingList.filter(item=>!item.completed);
  const shoppingItems = pendingShopping.slice(0,6);
  const pendingShoppingCount = pendingShopping.length;
  const dashboardItems = [...items]
    .sort(
      (left, right) =>
        displayStatusFor(left).priority - displayStatusFor(right).priority ||
        replenishmentFor(right) - replenishmentFor(left) ||
        left.name.localeCompare(right.name, localeForDates()),
    )
    .slice(0, 8);
  const categorySummary = summarizeHierarchy(
    categories,
    items,
    (item, category) => item.category === category.name,
  );
  const locationSummary = summarizeHierarchy(
    locations,
    items,
    (item, location) => item.locationId === location.id,
  );
  const currentDateLabel = new Intl.DateTimeFormat(localeForDates(), {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());
  const [calendarYear, calendarMonthNumber] = shoppingMonth
    .split("-")
    .map(Number);
  const calendarOffset =
    (new Date(calendarYear, calendarMonthNumber - 1, 1).getDay() + 6) % 7;
  const calendarDayCount = new Date(
    calendarYear,
    calendarMonthNumber,
    0,
  ).getDate();
  const calendarCells: (string | null)[] = [
    ...Array.from({ length: calendarOffset }, () => null),
    ...Array.from(
      { length: calendarDayCount },
      (_, index) => `${shoppingMonth}-${String(index + 1).padStart(2, "0")}`,
    ),
  ];
  while (calendarCells.length % 7) calendarCells.push(null);
  const visibleShoppingItems = shoppingList.filter(
    (item) =>
      !item.completed &&
      (!selectedShoppingDate || item.plannedDate === selectedShoppingDate),
  );
  if (!setup)
    return <div className="loading-screen">{t("正在检查家庭设置…")}</div>;
  if (!setup.complete)
    return (
      <Setup
        onComplete={(home) => {
          setAuthenticated(true);
          setSetup({ complete: true, home });
        }}
      />
    );
  if (!authenticated) return <Login onLogin={() => setAuthenticated(true)} />;

  async function updateAvatar(avatar:UserAvatar) {
    if(!currentUser||avatar===currentUser.avatar)return;
    setBusy(true);
    try {
      const response=await apiJson("/api/v1/auth/me", "PATCH", {avatar});
      if(!response.ok)throw new Error(t("头像保存失败"));
      setCurrentUser(await response.json() as CurrentUser);
    } catch(error) {
      setNotice(error instanceof Error?error.message:t("头像保存失败"));
    } finally {setBusy(false);}
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setItemFormError("");
    setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await apiJson(`/api/v1/homes/${getHomeId()}/items`, "POST", {
        name: data.get("name"),
        barcode: data.get("barcode") || undefined,
        icon: data.get("icon") || null,
        category: data.get("category"),
        baseUnit: data.get("baseUnit"),
        consumptionType:data.get("consumptionType") || "consumable",
        openedShelfLifeDays:data.get("openedShelfLifeDays")?Number(data.get("openedShelfLifeDays")):null,
        locationId: data.get("locationId") || undefined,
        reorderPoint: Number(data.get("reorderPoint") || 0),
        reorderQuantity: 0,
        initialStock: Number(data.get("initialStock") || 0),
        manufacturedDate: data.get("manufacturedDate") || undefined,
        expiryDate: data.get("expiryDate") || undefined,
        totalPrice:data.get("totalPrice")===""?undefined:Number(data.get("totalPrice")),
        purchaseDate:data.get("purchaseDate")||null,
        channelId:data.get("channelId")||null,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        setItemFormError(typeof result.message === "string" ? result.message : t("保存失败，请检查填写内容"));
        return;
      }
      form.reset();
      closeItemForm();
      void load();
    } catch {
      setItemFormError(t("保存失败，请检查填写内容"));
    } finally {
      setBusy(false);
    }
  }

  async function recordStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stockAction || busy) return;
    const data = new FormData(event.currentTarget);
    const quantity = Number(data.get("quantity"));
    const selectedLocation = String(
      data.get("locationId") || locations[0]?.id || locationId,
    );
    const targetLocation = String(data.get("targetLocationId") || selectedLocation);
    if (!quantity || quantity <= 0) return;
    setBusy(true);
    const response = await apiJson(`/api/v1/homes/${getHomeId()}/stock/${stockAction.type}`, "POST", {
          itemId: stockAction.item.id,
          locationId: selectedLocation,
          quantity,
          idempotencyKey: stockOperationKey,
          reason: data.get("reason") || undefined,
          ...(stockAction.type === "receipt"
            ? {
                manufacturedDate: data.get("manufacturedDate") || null,
                expiryDate: data.get("expiryDate") || null,
                totalPrice:data.get("totalPrice")===""?undefined:Number(data.get("totalPrice")),
                purchaseDate:data.get("purchaseDate")||null,
                channelId:data.get("channelId")||null,
              }
            : { batchId: data.get("batchId") || undefined,targetLocationId: targetLocation!==selectedLocation?targetLocation:undefined,issueReason:data.get("issueReason") || "used" }),
        });
    setBusy(false);
    if (response.ok) {
      setStockAction(null);
      load();
    } else setNotice(t("操作失败，可能是库存不足"));
  }

  async function exhaustOpened(opened:OpenedConsumable,quantity:number) {
    if(busy)return;
    setBusy(true);
    const response=await apiJson(`/api/v1/homes/${getHomeId()}/opened-consumables/${opened.id}/exhaust`, "POST", {quantity,idempotencyKey:newIdempotencyKey()});
    setBusy(false);
    if(!response.ok){setNotice(t("用尽操作失败"));return;}
    setExhaustTarget(null);
    load();
  }

  function submitExhaust(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!exhaustTarget)return;
    const quantity=Number(new FormData(event.currentTarget).get("quantity"));
    if(!quantity||quantity<=0||quantity>exhaustTarget.quantity)return;
    void exhaustOpened(exhaustTarget,quantity);
  }

  async function updateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detailItem) return;
    const data = new FormData(event.currentTarget);
    const response = await apiJson(`/api/v1/homes/${getHomeId()}/items/${detailItem.id}`, "PATCH", {
          name: data.get("name"),
          icon: data.get("icon") || null,
          barcode: data.get("barcode") || null,
          category: data.get("category"),
          consumptionType:data.get("consumptionType"),
          openedShelfLifeDays:data.get("openedShelfLifeDays")?Number(data.get("openedShelfLifeDays")):null,
          syncPurchaseCategory: data.get("syncPurchaseCategory") === "on",
          baseUnit: data.get("baseUnit"),
          reorderPoint: Number(data.get("reorderPoint") || 0),
          locationId: data.get("locationId") || null,
        });
    if (!response.ok) {
      setNotice(t("保存失败，请检查填写内容"));
      return;
    }
    setDetailItem(null);
    load();
  }

  async function addHierarchyNode(event:FormEvent,kind:"category"|"location") {
    event.preventDefault();
    const category=kind==="category";
    const response=await apiJson(`/api/v1/homes/${getHomeId()}/${category?"categories":"locations"}`,"POST",{
      name:(category?categoryName:locationName).trim(),
      parentId:(category?categoryParent:locationParent)||undefined,
    });
    if(!response.ok){setNotice(t(category?"分类添加失败":"地点添加失败"));return;}
    (category?setCategoryName:setLocationName)("");
    (category?setCategoryParent:setLocationParent)("");
    load();
  }
  async function addShoppingItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await apiJson(`/api/v1/homes/${getHomeId()}/shopping-list`, "POST", {
          quantity: Number(data.get("quantity") || 1),
          itemId: data.get("itemId") || undefined,
          channelId: data.get("channelId") || null,
          plannedDate: data.get("plannedDate") || null,
          estimatedTotal:data.get("estimatedTotal")===""?null:Number(data.get("estimatedTotal")),
          ...(!linkedShoppingItem
            ? {
                consumptionType: data.get("consumptionType") || "consumable",
                openedShelfLifeDays: data.get("openedShelfLifeDays") ? Number(data.get("openedShelfLifeDays")) : null,
                name: data.get("name"),
                unit: data.get("unit") || undefined,
                category: data.get("category") || undefined,
                locationId: data.get("locationId") || undefined,
              }
            : {}),
        });
    if (!response.ok) {
      setNotice(t("采购项添加失败"));
      return;
    }
    setShowShoppingForm(false);
    setShoppingItemId("");
    setSelectedShoppingDate("");
    await load();
  }
  async function receiveShopping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receiveShoppingItem || busy) return;
    const data = new FormData(event.currentTarget);
    const quantity = Number(data.get("quantity"));
    if (!Number.isFinite(quantity) || quantity <= 0) return;
    setBusy(true);
    const response = await apiJson(`/api/v1/homes/${getHomeId()}/shopping-list/${encodeURIComponent(receiveShoppingItem.id)}/receive`, "POST", {
          actualQuantity: quantity,
          idempotencyKey: receiveOperationKey,
          locationId: data.get("locationId") || undefined,
          manufacturedDate: data.get("manufacturedDate") || null,
          expiryDate: data.get("expiryDate") || null,
          totalPrice:data.get("totalPrice")===""?undefined:Number(data.get("totalPrice")),
          purchaseDate:data.get("purchaseDate")||null,
          completion:receiveCompletion,
        });
    setBusy(false);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setNotice(
        result.message ||
          t("采购项处理失败（{{status}}）", { status: response.status }),
      );
      return;
    }
    setReceiveShoppingItem(null);
    load();
  }
  function openStockAction(type: "receipt" | "issue", item: Item) {
    setStockLocationId(item.locationId || locations[0]?.id || "");
    setStockTargetLocationId(item.locationId || locations[0]?.id || "");
    setStockOperationKey(newIdempotencyKey());
    setStockAction({ type, item });
  }
  function chooseHomeIssueItem(item:Item) {
    setShowHomeIssuePicker(false);
    setHomeIssueQuery("");
    openStockAction("issue",item);
  }
  function openShoppingReceipt(item: ShoppingItem) {
    setReceiveOperationKey(newIdempotencyKey());
    setReceiveQuantity(String(item.quantity));
    setReceiveTotal(item.estimatedTotal==null?"":String(item.estimatedTotal));
    setReceiveCompletion("complete");
    setReceiveShoppingItem(item);
  }
  async function updateShoppingItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editShoppingItem) return;
    const data = new FormData(event.currentTarget);
    const response = await apiJson(`/api/v1/homes/${getHomeId()}/shopping-list/${editShoppingItem.id}`, "PATCH", {
          quantity: Number(data.get("quantity") || 1),
          itemId: data.get("itemId") || null,
          channelId: data.get("channelId") || null,
          plannedDate: data.get("plannedDate") || null,
          estimatedTotal:data.get("estimatedTotal")===""?null:Number(data.get("estimatedTotal")),
          ...(!linkedEditShoppingItem
            ? {
                consumptionType: data.get("consumptionType") || "consumable",
                openedShelfLifeDays: data.get("openedShelfLifeDays") ? Number(data.get("openedShelfLifeDays")) : null,
                name: data.get("name"),
                unit: data.get("unit"),
                category: data.get("category"),
                locationId: data.get("locationId") || null,
              }
            : {}),
        });
    if (!response.ok) {
      setNotice(t("采购项保存失败"));
      return;
    }
    setEditShoppingItem(null);
    setEditShoppingItemId("");
    load();
  }
  async function addShoppingChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newChannelName.trim()) return;
    const response = await apiJson(`/api/v1/homes/${getHomeId()}/shopping-channels`, "POST", { name: newChannelName.trim() });
    const result = await response.json();
    if (!response.ok) {
      setNotice(result.message || t("购买渠道添加失败"));
      return;
    }
    setNewChannelName("");
    load();
  }
  async function deleteShoppingChannel(channel: ShoppingChannel) {
    if (!window.confirm(t("删除购买渠道“{{name}}”？", { name: channelLabel(channel.name) })))
      return;
    const response = await apiFetch(
      `/api/v1/homes/${getHomeId()}/shopping-channels/${channel.id}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setNotice(result.message || t("购买渠道删除失败"));
      return;
    }
    load();
  }
  function moveShoppingMonth(offset: number) {
    const [year, month] = shoppingMonth.split("-").map(Number),
      date = new Date(year, month - 1 + offset, 1);
    setShoppingMonth(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    );
    setSelectedShoppingDate("");
  }
  async function updateTreeNode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editTreeNode) return;
    const data = new FormData(event.currentTarget);
    const response = await apiJson(`/api/v1/homes/${getHomeId()}/${editTreeNode.kind === "location" ? "locations" : "categories"}/${editTreeNode.id}`, "PATCH", {
          name: data.get("name"),
          parentId: data.get("parentId") || null,
        });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      const messages: Record<string, string> = {
        CATEGORY_CYCLE: t("不能移动到自己的子级下面"),
        LOCATION_CYCLE: t("不能移动到自己的子级下面"),
        CATEGORY_EXISTS: t("同级分类名称已存在"),
        LOCATION_EXISTS: t("同级地点名称已存在"),
        PARENT_CATEGORY_NOT_FOUND: t("父级分类不存在"),
        PARENT_LOCATION_NOT_FOUND: t("父级地点不存在"),
      };
      setNotice(
        messages[result.code] ||
          result.message ||
          t("保存失败（{{status}}）", { status: response.status }),
      );
      return;
    }
    setEditTreeNode(null);
    load();
  }
  function confirmDelete(
    kind: "item" | "category" | "location",
    node: { id: string; name: string; parentId?: string | null },
  ) {
    const parent = (kind === "category" ? categories : locations).find(
      (candidate) => candidate.id === node.parentId,
    );
    const fallback =
      kind === "category"
        ? node.name === "未分类"
          ? "其他"
          : "未分类"
        : node.name === "未指定"
          ? "待整理"
          : "未指定";
    setDeleteError("");
    setDeleteTarget({
      kind,
      id: node.id,
      name: node.name,
      message:
        kind === "item"
          ? t(
              "物资将从清单移除，剩余库存清零并记录删除流水。历史记录保留，关联采购项转为独立采购项。",
            )
          : t(
              "直属物资将归入“{{parent}}”，子节点{{action}}。物资不会被删除，仅记录实际的物资归属变更。",
              {
                parent: parent?.name || fallback,
                action: parent ? t("移到上一级") : t("提升为一级节点"),
              },
            ),
    });
  }
  async function deleteSelected(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const resource = {
        item: "items",
        category: "categories",
        location: "locations",
      }[deleteTarget.kind];
      const response = await apiFetch(
        `/api/v1/homes/${getHomeId()}/${resource}/${deleteTarget.id}`,
        { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || t("删除失败，请重试"));
      setDeleteTarget(null);
      setTransactionPage(1);
      await load();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : t("删除失败，请重试"),
      );
    } finally {
      setDeleting(false);
    }
  }
  async function loadApiTokens() {
    const response = await apiFetch("/api/v1/auth/tokens");
    if (response.ok) setApiTokens(await response.json());
    else setNotice(t("无法加载 MCP 令牌"));
  }
  async function updateHomeCurrency(home:{id:string;name:string;icon?:string;defaultCurrency?:string},defaultCurrency:string) {
    if(busy||defaultCurrency===home.defaultCurrency)return;
    setBusy(true);setHomeNotice("");
    try {
      const response=await apiJson(`/api/v1/homes/${home.id}`, "PATCH", {name:home.name,icon:home.icon||"house",defaultCurrency});
      const updated=await response.json();
      if(!response.ok)throw new Error(updated.message||t("保存失败"));
      setHomes(previous=>previous.map(value=>value.id===updated.id?updated:value));
      if(updated.id===setup?.home?.id)setSetup({complete:true,home:updated});
      setHomeNotice(t("默认币种已更新"));
    } catch(error) {setHomeNotice(error instanceof Error?error.message:t("保存失败"));}
    finally {setBusy(false);}
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget,
      data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") || "");
    const newPassword = String(data.get("newPassword") || "");
    const confirmation = String(data.get("confirmation") || "");
    if (newPassword !== confirmation) {
      setPasswordNotice(t("两次输入的新密码不一致"));
      return;
    }
    setBusy(true);
    setPasswordNotice("");
    try {
      const response = await apiJson("/api/v1/auth/password", "POST", { currentPassword, newPassword });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || t("密码修改失败"));
      form.reset();
      setPasswordNotice(t("密码已修改"));
    } catch (error) {
      setPasswordNotice(
        error instanceof Error ? error.message : t("密码修改失败"),
      );
    } finally {
      setBusy(false);
    }
  }
  async function createApiToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const scope = String(data.get("homeId") || "");
    const response = await apiJson("/api/v1/auth/tokens", "POST", { name, homeId: scope === "all" ? null : scope });
    if (!response.ok) {
      setNotice(t("创建令牌失败"));
      return;
    }
    const result = await response.json();
    setNewApiToken(result.token);
    form.reset();
    loadApiTokens();
  }
  async function revokeApiToken(tokenId: string) {
    const response = await apiFetch(`/api/v1/auth/tokens/${tokenId}`, {
      method: "DELETE",
    });
    if (response.ok) loadApiTokens();
    else setNotice(t("撤销令牌失败"));
  }
  function openItemForm(preset?: {
    locationId?: string;
    category?: string;
    name?: string;
    baseUnit?: string;
    barcode?: string;
  }) {
    setItemFormError("");
    setPrefillLocationId(preset?.locationId || "");
    setPrefillCategory(preset?.category || "");
    setPrefillName(preset?.name || "");
    setPrefillUnit(preset?.baseUnit || "个");
    setBarcodeInput(preset?.barcode || "");
    setBarcodeNotice("");
    setItemFormRevision((value) => value + 1);
    setShowForm(true);
  }
  function closeItemForm() {
    setItemFormError("");
    setShowForm(false);
    setShowBarcodeScanner(false);
    setPrefillLocationId("");
    setPrefillCategory("");
    setPrefillName("");
    setPrefillUnit("个");
    setBarcodeInput("");
    setBarcodeNotice("");
  }
  async function lookupItemBarcode(raw = barcodeInput) {
    const barcode = raw.replace(/[\s-]/g, "");
    if (!barcode) return;
    setBarcodeBusy(true);
    setBarcodeNotice("");
    try {
      const response = await apiFetch(
        `/api/v1/homes/${getHomeId()}/barcodes/${encodeURIComponent(barcode)}`,
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || t("条码查询失败"));
      setBarcodeInput(result.barcode);
      if (result.item) {
        closeItemForm();
        setDetailItem(result.item);
        setNotice(t("条码已关联物资“{{name}}”", { name: result.item.name }));
        return;
      }
      if (result.found && result.product) {
        setPrefillName(result.product.name || "");
        setPrefillCategory(result.product.category || "其他");
        setPrefillUnit(result.product.baseUnit || "个");
        setItemFormRevision((value) => value + 1);
        setBarcodeNotice(
          result.source === "online"
            ? t("已从在线条码库补全商品信息")
            : t("已从本地条码缓存补全商品信息"),
        );
      } else setBarcodeNotice(t("在线条码库暂无该商品，请手动填写信息"));
    } catch (error) {
      setBarcodeNotice(
        error instanceof Error ? error.message : t("条码查询失败"),
      );
    } finally {
      setBarcodeBusy(false);
    }
  }
  async function saveFinanceBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (financeSaving) return;
    const invalid=financeAllocations.rows.find(row=>row.unallocated<0);
    if(invalid){setNotice(t("子分类额度超过{{category}}预算",{category:invalid.category}));return;}
    const totalValue=financeBudgetTotal.trim();
    const categoryBudgets=completeBudgetTree(categories,financeBudgetEntries).map(entry=>({category:entry.category,amount:Number(entry.amount)}));
    setFinanceSaving(true);
    try {
      const response=await apiJson(`/api/v1/homes/${getHomeId()}/financial-budget`, "PATCH", {month:financeMonth,total:totalValue===""?null:Number(totalValue),categoryBudgets});
      const result=await response.json();
      if(!response.ok)throw new Error(result.message||t("保存失败"));
      setFinanceDashboard(result);
      setFinanceBudgetTotal(result.budgetTotal?.toString()??"");
      setFinanceBudgetEntries(result.categoryBudgets.map((budget:{category:string;amount:number})=>({category:budget.category,amount:budget.amount.toFixed(2)})));
      setNotice(t("预算已保存"));
    } catch(error) {setNotice(error instanceof Error?error.message:t("保存失败"));}
    finally {setFinanceSaving(false);}
  }
  function addFinanceCategoryBudget() {
    if(!financeCategorySelection||financeCategoryAmount.trim()===""||Number(financeCategoryAmount)<0)return;
    setFinanceBudgetEntries(entries=>setBudgetAllocation(categories,entries,financeCategorySelection,Number(financeCategoryAmount).toFixed(2)));
    setFinanceCategorySelection("");
    setFinanceCategoryAmount("");
  }
  function addFinanceCategoryBudgetOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if(event.key!=="Enter")return;
    event.preventDefault();
    addFinanceCategoryBudget();
  }
  function navigate(page: Page) {
    if (window.location.pathname !== pagePaths[page])
      window.history.pushState(null, "", pagePaths[page]);
    setActivePage(page);
    setItemDetailId(null);
  }
  function openItemDetail(itemId:string) {
    window.history.pushState({itemDetailSource:activePage},"",`/items/${itemId}`);
    setItemDetailId(itemId);
  }
  function closeItemDetail() {
    if(itemDetailSourcePage()){
      window.history.back();
      return;
    }
    window.history.replaceState(null,"",pagePaths.count);
    setActivePage("count");
    setItemDetailId(null);
  }
  async function logout() {
    setBusy(true);
    try {
      const response = await apiFetch("/api/v1/auth/logout", {
        method: "POST",
      });
      if (!response.ok && response.status !== 401)
        throw new Error(t("退出失败，请重试"));
      window.location.reload();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t("退出失败"));
      setBusy(false);
    }
  }

  type TreeNode = {
    id: string;
    name: string;
    parentId: string | null;
    items: LocationScopedItem[];
  };
  const treeNodes: TreeNode[] =
    treeMode === "location"
      ? locations.map((location) => ({
          id: location.id,
          name: location.name,
          parentId: location.parentId,
          items: locationScopedItems.filter(
            (item) => item.locationId === location.id,
          ),
        }))
      : categories.map((category) => ({
          id: category.id,
          name: category.name,
          parentId: category.parentId,
          items: locationScopedItems.filter(
            (item) => item.category === category.name,
          ),
        }));
  const categoryOptions = flattenHierarchy(categories);
  const locationOptions = flattenHierarchy(locations);
  const selectCategoryOptions = categories.length
    ? categoryOptions
    : itemCategories.map((name) => ({
        id: name,
        name,
        parentId: null,
        depth: 0,
      }));
  const financeAllocations=budgetAllocations(categories,financeBudgetEntries);
  const financeAllocatedBudget=financeAllocations.total;
  const expandableTreeNodeIds=treeNodes.filter(node=>node.items.length>0||treeNodes.some(child=>child.parentId===node.id)).map(node=>node.id);
  const treeFullyExpanded=expandableTreeNodeIds.every(id=>expandedLocations[id]??true);
  function toggleAllTreeNodes() {
    const nextOpen=!treeFullyExpanded;
    setExpandedLocations(previous=>({
      ...previous,
      ...Object.fromEntries(expandableTreeNodeIds.map(id=>[id,nextOpen])),
    }));
  }
  async function moveTreeItem(target:TreeNode) {
    const dragged=draggedTreeItem;
    if(!dragged||treeMoving||dragged.sourceNodeId===target.id)return;
    setTreeMoving(true);
    try {
      const body=treeMode==="location"?{locationId:target.id}:{category:target.name};
      const response=await apiJson(`/api/v1/homes/${getHomeId()}/items/${dragged.item.id}`, "PATCH", body);
      if(!response.ok) {
        const result=await response.json().catch(()=>({}));
        throw new Error(result.message||t("保存失败，请重试"));
      }
      await load();
    } catch(error) {
      setNotice(error instanceof Error?error.message:t("保存失败，请重试"));
    } finally {
      setTreeMoving(false);
      setDraggedTreeItem(null);
      setTreeDropTarget(null);
    }
  }
  const renderTreeNode = (node: TreeNode, depth = 0) => {
    const open = expandedLocations[node.id] ?? true;
    const children = treeNodes.filter((child) => child.parentId === node.id);
    const expandable = children.length > 0 || node.items.length > 0;
    return (
      <div className="tree-node" key={node.id}>
        <div
          className={`tree-node-head${treeDropTarget===node.id?" tree-drop-target":""}`}
          style={{ "--tree-depth": depth } as CSSProperties}
          onDragEnter={event=>{if(draggedTreeItem&&draggedTreeItem.sourceNodeId!==node.id){event.preventDefault();setTreeDropTarget(node.id);}}}
          onDragOver={event=>{if(draggedTreeItem&&draggedTreeItem.sourceNodeId!==node.id){event.preventDefault();event.dataTransfer.dropEffect="move";}}}
          onDrop={event=>{event.preventDefault();void moveTreeItem(node);}}
        >
          <button
            type="button"
            className="tree-expander"
            disabled={!expandable}
            aria-label={open ? t("收起") : t("展开")}
            onClick={() =>
              setExpandedLocations({ ...expandedLocations, [node.id]: !open })
            }
          >
            {expandable &&
              (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
          </button>
          <button
            type="button"
            className="tree-node-label"
            disabled={!expandable}
            onClick={() =>
              setExpandedLocations({ ...expandedLocations, [node.id]: !open })
            }
          >
            {treeMode === "category" ? categoryLabel(node.name) : node.name}
          </button>
          <div className="tree-node-actions">
            <button type="button" className="tree-add" aria-label={t("盘点{{name}}",{name:node.name})} onClick={()=>{
              const selected=treeMode==="location"?locations.find(row=>row.id===node.id):categories.find(row=>row.id===node.id);
              if(!selected)return;
              window.history.pushState(null,"",`${pagePaths[activePage]}#stocktake${treeMode==="category"?"-category":""}=${node.id}`);
              setStocktakeScope(treeMode==="location"?{kind:"location",node:selected as Location}:{kind:"category",node:selected as Category});
            }}>{t("盘点")}</button>
            <button
              type="button"
              className="tree-icon-button"
              title={t("增加物资")}
              aria-label={t("在{{name}}增加物资", { name: node.name })}
              onClick={() =>
                openItemForm(
                  treeMode === "location"
                    ? { locationId: node.id }
                    : { category: node.name },
                )
              }
            >
              <Plus size={14} />
            </button>
            <button
              type="button"
              className="tree-icon-button"
              title={t("编辑{{type}}", {
                type: treeMode === "location" ? t("地点") : t("分类"),
              })}
              aria-label={t("编辑{{name}}", { name: node.name })}
              onClick={() =>
                setEditTreeNode({
                  kind: treeMode,
                  id: node.id,
                  name: node.name,
                  parentId: node.parentId,
                })
              }
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              className="tree-icon-button danger-action"
              title={t("删除{{type}}", {
                type: treeMode === "location" ? t("地点") : t("分类"),
              })}
              aria-label={t("删除{{name}}", { name: node.name })}
              onClick={() => confirmDelete(treeMode, node)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        {open && (
          <>
            {node.items.map((item) => {
              const status = displayStatusFor(item);
              return (
                <div
                  className={`tree-item-row${draggedTreeItem?.item.id===item.id?" tree-item-dragging":""}`}
                  key={`${item.id}:${item.locationId??"none"}`}
                  style={{ "--tree-depth": depth } as CSSProperties}
                  draggable={!treeMoving}
                  onDragStart={event=>{event.dataTransfer.effectAllowed="move";event.dataTransfer.setData("text/plain",item.id);setDraggedTreeItem({item,sourceNodeId:node.id});}}
                  onDragEnd={()=>{setDraggedTreeItem(null);setTreeDropTarget(null);}}
                >
                  <strong className="tree-item-name">
                    <MaterialIcon value={itemIconFor(item)} />
                    {item.name}
                  </strong>
                  <span className="tree-item-stock">
                    {item.treeQuantity ?? balanceFor(item.id)}{" "}
                    {displayUnit(item.baseUnit)}
                  </span>
                  <span className={`stock-status ${status.level}`}>
                    {status.label}
                  </span>
                  <span className="tree-item-meta">
                    {treeMode === "location"
                      ? item.category ? categoryLabel(item.category) : t("未分类")
                      : item.locationName || t("未指定地点")}
                    {item.expiryDate
                      ? t(" · 到期 {{date}}", { date: item.expiryDate })
                      : ""}
                  </span>
                  <button
                    className="text-button"
                    onClick={() =>
                      setDetailItem(
                        items.find((current) => current.id === item.id) ?? item,
                      )
                    }
                  >
                    {t("编辑")}
                  </button>
                </div>
              );
            })}
            {children.map((child) => renderTreeNode(child, depth + 1))}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="shell" data-page={activePage}>
      <header className="topbar">
        <div className="brand">
          <img className="brand-mascot" src="/alice.gif" alt="Alice" />
          <div>
            <BrandWordmark />
          </div>
        </div>
        <nav className="main-nav" aria-label={t("主导航")}>
          <button
            className={activePage === "home" ? "active" : ""}
            onClick={() => navigate("home")}
          >
            {t("首页")}
          </button>
          <button
            className={activePage === "count" ? "active" : ""}
            onClick={() => navigate("count")}
          >
            {t("盘点")}
          </button>
          <button
            className={activePage === "shopping" ? "active" : ""}
            onClick={() => navigate("shopping")}
          >
            {t("采购")}
          </button>
          <button
            className={activePage === "finance" ? "active" : ""}
            onClick={() => navigate("finance")}
          >
            {t("财务")}
          </button>
          <button
            className={activePage === "locations" ? "active" : ""}
            onClick={() => navigate("locations")}
          >
            {t("地点")}
          </button>
          <button
            className={activePage === "categories" ? "active" : ""}
            onClick={() => navigate("categories")}
          >
            {t("分类")}
          </button>
        </nav>
        <div className="top-actions">
          <div className="home-switch">
            <MaterialIcon value={setup.home?.icon} home size={18} />
            <select
              aria-label={t("切换家庭")}
              value={setup.home?.id ?? ""}
              onChange={(event) => {
                localStorage.setItem("al1s-wms-home-id", event.target.value);
                window.location.reload();
              }}
            >
              {homes.map((home) => (
                <option key={home.id} value={home.id}>
                  {home.name}
                </option>
              ))}
            </select>
          </div>
          <button
            className={`avatar ${activePage === "profile" ? "active" : ""}`}
            onClick={() => navigate("profile")}
            aria-label={t("账号与 MCP 令牌")}
          >
            <AvatarIcon avatar={currentUser?.avatar} size={17}/>
          </button>
        </div>
      </header>
      <main>
        {itemDetailId&&<ItemDetail homeId={getHomeId()} item={items.find(item=>item.id===itemDetailId)??{id:itemDetailId,name:t("物资"),sku:"",category:t("未分类"),baseUnit:t("个"),reorderPoint:0,reorderQuantity:0}} currency={financialSummary?.currency??"CNY"} onToggleReplenishment={()=>{const item=items.find(current=>current.id===itemDetailId);if(item)void toggleReplenishment(item);}} busy={busy} batchRevision={batchRevision} onBack={closeItemDetail} onEdit={()=>{const item=items.find(current=>current.id===itemDetailId);if(item)setDetailItem(item);}} onIssue={()=>{const item=items.find(current=>current.id===itemDetailId);if(item)openStockAction("issue",item);}} onEditBatch={batchId=>{const item=items.find(current=>current.id===itemDetailId);if(item){setInitialBatchId(batchId);setBatchItem(item);}}}/>}
        <div className="page-content" hidden={Boolean(itemDetailId)}>
        <section className="welcome">
          <div>
            <p className="eyebrow">{currentDateLabel}</p>
            <h1>
              {activePage === "home"
                ? t("总览")
                : activePage === "count"
                  ? t("物资盘点")
                  : activePage === "locations"
                    ? t("地点")
                    : activePage === "categories"
                      ? t("分类")
                      : activePage === "shopping"
                        ? t("采购清单")
                        : activePage === "finance"
                          ? t("财务")
                        : t("我的设置")}
            </h1>
            <p className="muted">
              {activePage === "home"
                ? t("掌握家里有什么，及时补充需要的东西。")
                : activePage === "count"
                  ? t("添加物资、调整库存并查看变动记录。")
                  : activePage === "locations"
                    ? t("按存放空间查看家里的物资。")
                    : activePage === "categories"
                      ? t("维护物资分类和分类树。")
                      : activePage === "shopping"
                        ? t("管理自动建议和手动采购项。")
                        : activePage === "finance"
                          ? t("查看预算、采购支出、库存成本与损耗。")
                        : t("管理家庭、Agent 访问令牌与登录会话。")}
            </p>
          </div>
          {activePage === "profile" && (
            <ProfileLogout busy={busy} logout={logout} />
          )}
          {activePage === "home" && (
            <div className="dashboard-actions" aria-label={t("快捷操作")}>
              <button type="button" onClick={() => openItemForm()}>
                <Plus size={16} />
                {t("添加物资")}
              </button>
              <button type="button" onClick={() => setShowHomeIssuePicker(true)}>
                <CircleMinus size={16} />
                {t("领用")}
              </button>
              <button type="button" onClick={() => navigate("count")}>
                <Check size={16} />
                {t("盘点")}
              </button>
              <button type="button" onClick={() => navigate("shopping")}>
                <ClipboardList size={16} />
                {t("采购清单")}
              </button>
            </div>
          )}
          {activePage === "shopping" && (
            <button
              className="primary"
              onClick={() => setShowShoppingForm(true)}
            >
              {t("＋ 添加采购项")}
            </button>
          )}
          {activePage === "count" && (
            <div className="welcome-actions count-actions">
              <button className="primary" onClick={() => openItemForm()}>
                {t("＋ 添加物资")}
              </button>
              <button
                className="secondary"
                onClick={() => {
                  openItemForm();
                  setShowBarcodeScanner(true);
                }}
              >
                {t("扫描条码")}
              </button>
            </div>
          )}
        </section>
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button onClick={() => setNotice("")} aria-label={t("关闭")}>
              ×
            </button>
          </div>
        )}
        {activePage === "finance" && financeDashboard && (
          <FinancePage setFinanceMonth={setFinanceMonth} financeMonth={financeMonth} financeDashboard={financeDashboard} saveFinanceBudget={saveFinanceBudget} financeFlowRef={financeFlowRef} financeFlowSize={financeFlowSize} financeBudgetLinks={financeBudgetLinks} financeBudgetOriginRef={financeBudgetOriginRef} financeBudgetTotal={financeBudgetTotal} setFinanceBudgetTotal={setFinanceBudgetTotal} financeAllocatedBudget={financeAllocatedBudget} categories={categories} financeBudgetEntries={financeBudgetEntries} financeCategorySelection={financeCategorySelection} setFinanceCategorySelection={setFinanceCategorySelection} financeCategoryAmount={financeCategoryAmount} setFinanceCategoryAmount={setFinanceCategoryAmount} addFinanceCategoryBudgetOnEnter={addFinanceCategoryBudgetOnEnter} addFinanceCategoryBudget={addFinanceCategoryBudget} financeBudgetListRef={financeBudgetListRef} financeBudgetEntryRefs={financeBudgetEntryRefs} setFinanceBudgetEntries={setFinanceBudgetEntries} financeSaving={financeSaving} financeAllocations={financeAllocations} openItemDetail={openItemDetail} setFinanceDashboard={setFinanceDashboard} setNotice={setNotice} load={load} />
        )}
        {activePage === "profile" && (
          <ProfileUserSettings currentUser={currentUser} busy={busy} updateAvatar={updateAvatar} activeI18n={activeI18n} changePassword={changePassword} passwordNotice={passwordNotice} />
        )}
        {activePage === "profile" && (
          <ProfileHomeSettings homes={homes} busy={busy} setEditingHome={setEditingHome} setHomeNotice={setHomeNotice} setup={setup} updateHomeCurrency={updateHomeCurrency} editingHome={editingHome} setBusy={setBusy} setHomes={setHomes} setSetup={setSetup} homeNotice={homeNotice} />
        )}
        {activePage === "profile" && (
          <ProfileTokens barcodeNotice={barcodeNotice} createApiToken={createApiToken} homes={homes} newApiToken={newApiToken} setNewApiToken={setNewApiToken} apiTokens={apiTokens} revokeApiToken={revokeApiToken} />
        )}
        {activePage === "locations" && <HierarchyManager kind="location" name={locationName} parent={locationParent} options={locationOptions} onNameChange={setLocationName} onParentChange={setLocationParent} onSubmit={event=>addHierarchyNode(event,"location")}/>}
        {activePage === "categories" && <HierarchyManager kind="category" name={categoryName} parent={categoryParent} options={categoryOptions} onNameChange={setCategoryName} onParentChange={setCategoryParent} onSubmit={event=>addHierarchyNode(event,"category")}/>}
        {activePage === "shopping" && (
          <ShoppingPage openItemDetail={openItemDetail} selectedShoppingDate={selectedShoppingDate} visibleShoppingItems={visibleShoppingItems} items={items} locations={locations} shoppingChannelName={shoppingChannelName} financialSummary={financialSummary} setEditShoppingItem={setEditShoppingItem} setEditShoppingItemId={setEditShoppingItemId} openShoppingReceipt={openShoppingReceipt} load={load} setMobileAction={setMobileAction} shoppingChannels={shoppingChannels} addShoppingChannel={addShoppingChannel} newChannelName={newChannelName} setNewChannelName={setNewChannelName} deleteShoppingChannel={deleteShoppingChannel} moveShoppingMonth={moveShoppingMonth} setShoppingMonth={setShoppingMonth} setSelectedShoppingDate={setSelectedShoppingDate} calendarYear={calendarYear} calendarMonthNumber={calendarMonthNumber} calendarIncludeCompleted={calendarIncludeCompleted} updateCalendarIncludeCompleted={updateCalendarIncludeCompleted} calendarFinancial={calendarFinancial} calendarCells={calendarCells} calendarItems={calendarItems} />
        )}
        {activePage === "home" && (
          <section className="summary-grid">
            <div className="summary-card">
              <span className="summary-icon">
                <Package size={18} />
              </span>
              <div>
                <span className="summary-label">{t("物资种类")}</span>
                <strong>{items.length}</strong>
                <span className="summary-foot">{t("当前在管物资")}</span>
              </div>
            </div>
            <div className="summary-card warning">
              <span className="summary-icon">
                <TriangleAlert size={18} />
              </span>
              <div>
                <span className="summary-label">{t("需要补充")}</span>
                <strong>{lowStock}</strong>
                <span className="summary-foot">{t("低于最低库存")}</span>
              </div>
            </div>
            <div className="summary-card">
              <span className="summary-icon">
                <CalendarClock size={18} />
              </span>
              <div>
                <span className="summary-label">{t("即将到期")}</span>
                <strong>{expiringItems.length}</strong>
                <span className="summary-foot">{t("未来 30 天")}</span>
              </div>
            </div>
            <div className="summary-card">
              <span className="summary-icon"><Package size={18}/></span>
              <div><span className="summary-label">{t("已开封")}</span><strong>{openedConsumables.length}</strong><button type="button" className="summary-foot text-button" onClick={()=>navigate("count")}>{t("查看开封物品")}</button></div>
            </div>
            <div className="summary-card shopping">
              <span className="summary-icon">
                <ShoppingCart size={18} />
              </span>
              <div>
                <span className="summary-label">{t("待采购")}</span>
                <strong>{pendingShoppingCount}</strong>
                <span className="summary-foot">{t("未完成采购项")}</span>
              </div>
            </div>
            <div className="summary-card">
              <span className="summary-icon"><Wallet size={18}/></span>
              <div><span className="summary-label">{t("本月支出")}</span><strong className="money-value">{formatMoney(financialSummary?.spendingTotal??0,financialSummary?.currency)}</strong><span className="summary-foot">{t("实际采购成本")}</span></div>
            </div>
          </section>
        )}
        {activePage === "home" && !logView && (
          <DashboardPage navigate={navigate} dashboardItems={dashboardItems} displayStatusFor={displayStatusFor} openItemDetail={openItemDetail} balanceFor={balanceFor} pagedTransactions={pagedTransactions} transactionTotal={transactionTotal} transactionPageSize={transactionPageSize} setTransactionPageSize={setTransactionPageSize} setTransactionPage={setTransactionPage} transactionPage={transactionPage} transactionPageCount={transactionPageCount} shoppingItems={shoppingItems} openedConsumables={openedConsumables} categorySummary={categorySummary} locationSummary={locationSummary} />
        )}
        {!countView && !logView && activePage === "count" && (
          <InventoryPage toggleReplenishment={toggleReplenishment} openTransfer={item=>{setWorkflowItem(item);setWorkflowDialog("transfer");}} stockStatusFilter={stockStatusFilter} expiryFilter={expiryFilter} setStockStatusFilter={setStockStatusFilter} setExpiryFilter={setExpiryFilter} items={items} belowStockCount={belowStockCount} criticalStockCount={criticalStockCount} emptyStockCount={emptyStockCount} expiringItems={expiringItems} openedConsumables={openedConsumables} openItemDetail={openItemDetail} busy={busy} setExhaustTarget={setExhaustTarget} inventorySort={inventorySort} filtered={filtered} query={query} setQuery={setQuery} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} categoryOptions={categoryOptions} locationFilter={locationFilter} setLocationFilter={setLocationFilter} locationOptions={locationOptions} setInventorySort={setInventorySort} pagedItems={pagedItems} displayStatusFor={displayStatusFor} replenishmentFor={replenishmentFor} balanceFor={balanceFor} financialSummary={financialSummary} openStockAction={openStockAction} setBatchItem={setBatchItem} setDetailItem={setDetailItem} confirmDelete={confirmDelete} setMobileAction={setMobileAction} pageSize={pageSize} setPageSize={setPageSize} setPage={setPage} pageStart={pageStart} pageEnd={pageEnd} page={page} pageCount={pageCount} />
        )}
        {activePage === "count" && !logView && (
          <section className="panel recent-log">
            <div className="panel-head">
              <div>
                <h2>{t("最近变动")}</h2>
                <p className="muted">{t("按时间倒序的库存流水")}</p>
              </div>
              <button type="button" className="text-button" onClick={()=>setWorkflowDialog("history")}>{t("操作撤销")}</button>
            </div>
            {pagedTransactions.length === 0 ? (
              <p className="empty">{t("暂无库存变动")}</p>
            ) : (
              <div className="log-list">
                {pagedTransactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    onOpenItem={transaction.type==="delete"?undefined:openItemDetail}
                  />
                ))}
              </div>
            )}
            <TransactionPagination total={transactionTotal} page={transactionPage} pageSize={transactionPageSize} pageCount={transactionPageCount} onPage={setTransactionPage} onPageSize={setTransactionPageSize}/>
          </section>
        )}
        {countView && (
          <section className="panel count-panel inventory-tree">
            <div className="panel-head">
              <div>
                <h2>{treeMode === "location" ? t("地点") : t("分类")}</h2>
                <p className="muted">{t("展开节点查看库存与状态")}</p>
              </div>
              <div className="panel-tools">
                <button
                  className="text-button"
                  disabled={!expandableTreeNodeIds.length}
                  onClick={toggleAllTreeNodes}
                >
                  {treeFullyExpanded?t("全部闭合"):t("全部展开")}
                </button>
              </div>
            </div>
            {treeNodes
              .filter((node) => !node.parentId)
              .map((node) => renderTreeNode(node))}
            {treeNodes.length === 0 && <p className="empty">{t("暂无节点")}</p>}
          </section>
        )}
        {logView && (
          <section className="panel full-log">
            <div className="panel-head">
              <div>
                <h2>{t("完整变动日志")}</h2>
                <p className="muted">{t("按时间倒序记录库存变动")}</p>
              </div>
              <button className="text-button" onClick={() => setLogView(false)}>
                {t("返回总览")}
              </button>
            </div>
            <div className="log-list">
              {transactions.length === 0 ? (
                <p className="empty">{t("暂无库存变动")}</p>
              ) : (
                transactions.map((transaction) => (
                  <TransactionRow
                    key={transaction.id}
                    transaction={transaction}
                    onOpenItem={transaction.type==="delete"?undefined:openItemDetail}
                  />
                ))
              )}
            </div>
          </section>
        )}
        </div>
      </main>
      {mobileAction&&<div className="modal-backdrop mobile-action-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setMobileAction(null)}><section className="mobile-action-sheet" role="dialog" aria-modal="true"><div className="modal-head"><div><h2>{mobileAction.item.name}</h2><p className="muted">{t("选择操作")}</p></div><button type="button" className="close" aria-label={t("关闭")} onClick={()=>setMobileAction(null)}><X size={18}/></button></div><div className="mobile-action-list">{mobileAction.kind==="shopping"?<><button type="button" onClick={()=>{setEditShoppingItem(mobileAction.item);setEditShoppingItemId(mobileAction.item.itemId||"");setMobileAction(null);}}>{mobileAction.item.source==="automatic"?t("安排"):t("编辑")}</button><button type="button" onClick={()=>{openShoppingReceipt(mobileAction.item);setMobileAction(null);}}>{t("入库")}</button>{mobileAction.item.source==="manual"&&<button type="button" className="danger-action" onClick={()=>{const item=mobileAction.item;setMobileAction(null);void apiFetch(`/api/v1/homes/${getHomeId()}/shopping-list/${item.id}`,{method:"DELETE"}).then(load);}}>{t("删除")}</button>}</>:<><button type="button" onClick={()=>{openStockAction("receipt",mobileAction.item);setMobileAction(null);}}>{t("入库")}</button><button type="button" onClick={()=>{openStockAction("issue",mobileAction.item);setMobileAction(null);}}>{t("领用")}</button><button type="button" onClick={()=>{setBatchItem(mobileAction.item);setMobileAction(null);}}>{t("批次")}</button><button type="button" onClick={()=>{setWorkflowItem(mobileAction.item);setWorkflowDialog("transfer");setMobileAction(null);}}>{t("移动")}</button><button type="button" onClick={()=>{setDetailItem(items.find(item=>item.id===mobileAction.item.id)??mobileAction.item);setMobileAction(null);}}>{t("编辑")}</button><button type="button" disabled={busy} onClick={()=>{void toggleReplenishment(mobileAction.item);setMobileAction(null);}}>{t(mobileAction.item.replenishmentPaused?"复购":"停购")}</button><button type="button" className="danger-action" onClick={()=>{confirmDelete("item",mobileAction.item);setMobileAction(null);}}>{t("删除")}</button></>}</div></section></div>}
      {deleteTarget && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleting)
              setDeleteTarget(null);
          }}
        >
          <form
            className="modal delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            onSubmit={deleteSelected}
          >
            <div className="modal-head">
              <h2 id="delete-title">
                {deleteTarget.kind === "item"
                  ? t("删除物资")
                  : deleteTarget.kind === "category"
                    ? t("删除分类")
                    : t("删除地点")}
              </h2>
              <button
                type="button"
                className="close"
                disabled={deleting}
                aria-label={t("关闭")}
                onClick={() => setDeleteTarget(null)}
              >
                <X size={18} />
              </button>
            </div>
            <strong>{deleteTarget.name}</strong>
            <p>{deleteTarget.message}</p>
            {deleteError && (
              <p className="setup-error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="delete-dialog-actions">
              <button
                type="button"
                className="secondary"
                autoFocus
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
              >
                {t("取消")}
              </button>
              <button className="primary danger-button" disabled={deleting}>
                {deleting ? t("删除中…") : t("确认删除")}
              </button>
            </div>
          </form>
        </div>
      )}
      {detailItem && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setDetailItem(null)
          }
        >
          <form className="modal" onSubmit={updateItem}>
            <div className="modal-head">
              <div>
                <h2>{t("编辑物资")}</h2>
                <p className="muted">{detailItem.name}</p>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setDetailItem(null)}
                aria-label={t("关闭")}
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>
            <label>
              {t("物资名称")}
              <input name="name" required defaultValue={detailItem.name} />
            </label>
            <label>
              {t("商品条码（可选）")}
              <input
                name="barcode"
                inputMode="numeric"
                pattern="[0-9]{8,14}"
                defaultValue={detailItem.barcode || ""}
              />
            </label>
            <label>
              {t("类型")}
              <select name="category" defaultValue={detailItem.category}>
                {selectCategoryOptions.map((category) => (
                  <option key={category.id} value={category.name}>
                    {"　".repeat(category.depth)}
                    {categoryLabel(category.name)}
                  </option>
                ))}
              </select>
            </label>
            <ConsumptionFields key={detailItem.id} consumptionType={detailItem.consumptionType} openedShelfLifeDays={detailItem.openedShelfLifeDays}/>
            <label className="batch-toggle">
              <input name="syncPurchaseCategory" type="checkbox" />
              <span aria-hidden="true" />
              <b>{t("同步更新历史采购流水分类")}</b>
            </label>
            <div className="form-row">
              <label>
                {t("当前库存（只读）")}
                <input value={balanceFor(detailItem.id)} readOnly />
                <small className="form-hint">
                  {t("请通过入库、领用或盘点调整库存")}
                </small>
              </label>
              <label>
                {t("单位")}
                <select
                  name="baseUnit"
                  required
                  defaultValue={detailItem.baseUnit}
                >
                  <UnitOptions current={detailItem.baseUnit} />
                </select>
                <small className="form-hint">
                  {t("已有库存流水后不可更改单位")}
                </small>
              </label>
              <label>
                {t("最低库存")}
                <input
                  name="reorderPoint"
                  type="number"
                  min="0"
                  step="any"
                  defaultValue={detailItem.reorderPoint}
                />
              </label>
            </div>
            <label>
              {t("存放地点")}
              <select
                name="locationId"
                defaultValue={detailItem.locationId || ""}
              >
                <option value="">{t("暂不指定")}</option>
                {locationOptions.map((location) => (
                  <option key={location.id} value={location.id}>
                    {"　".repeat(location.depth)}
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <IconPicker initial={detailItem.icon} />
            <div className="edit-item-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setBatchItem(detailItem);
                  setDetailItem(null);
                }}
              >
                {t("管理库存批次")}
              </button>
              <button className="primary">{t("保存修改")}</button>
            </div>
          </form>
        </div>
      )}
      {editTreeNode && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setEditTreeNode(null)
          }
        >
          <form className="modal" onSubmit={updateTreeNode}>
            <div className="modal-head">
              <div>
                <h2>
                  {t("编辑")}
                  {editTreeNode.kind === "location" ? t("地点") : t("分类")}
                </h2>
                <p className="muted">{t("调整名称或父级")}</p>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setEditTreeNode(null)}
                aria-label={t("关闭")}
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>
            <label>
              {t("名称")}
              <input name="name" required defaultValue={editTreeNode.name} />
            </label>
            <label>
              {t("父级")}
              <select
                name="parentId"
                defaultValue={editTreeNode.parentId || ""}
              >
                <option value="">
                  {t("一级")}
                  {editTreeNode.kind === "location" ? t("地点") : t("分类")}
                </option>
                {(editTreeNode.kind === "location"
                  ? locationOptions
                  : categoryOptions
                )
                  .filter((node) => node.id !== editTreeNode.id)
                  .map((node) => (
                    <option key={node.id} value={node.id}>
                      {"　".repeat(node.depth)}
                      {node.name}
                    </option>
                  ))}
              </select>
            </label>
            <button className="primary full">{t("保存修改")}</button>
          </form>
        </div>
      )}
      {batchItem && (
        <Batches
          homeId={getHomeId()}
          item={batchItem}
          initialBatchId={initialBatchId}
          onClose={() => { setBatchItem(null); setInitialBatchId(null); }}
          onChange={() => { setBatchRevision(value => value + 1); void load(); }}
        />
      )}
      {exhaustTarget&&<div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&setExhaustTarget(null)}><form className="modal" onSubmit={submitExhaust}><div className="modal-head"><div><h2>{t("用尽已开封物品")}</h2><p className="muted">{exhaustTarget.itemName}</p></div><button type="button" className="close" onClick={()=>setExhaustTarget(null)} aria-label={t("关闭")}><X size={18} strokeWidth={1.8}/></button></div><label>{t("用尽数量")}<input name="quantity" type="number" min="0" max={exhaustTarget.quantity} step="any" defaultValue={exhaustTarget.quantity>=1?1:exhaustTarget.quantity} autoFocus required/><small className="form-hint">{t("当前已开封 {{quantity}} {{unit}}",{quantity:exhaustTarget.quantity,unit:displayUnit(exhaustTarget.baseUnit)})}</small></label><button className="primary full" disabled={busy}>{busy?t("处理中…"):t("确认用尽")}</button></form></div>}
      {showHomeIssuePicker&&<div className="modal-backdrop" onMouseDown={event=>event.target===event.currentTarget&&(setShowHomeIssuePicker(false),setHomeIssueQuery(""))}><section className="modal home-issue-picker" role="dialog" aria-modal="true" aria-labelledby="home-issue-title"><div className="modal-head"><div><h2 id="home-issue-title">{t("领用物资")}</h2><p className="muted">{t("选择要领用的物资")}</p></div><button type="button" className="close" onClick={()=>{setShowHomeIssuePicker(false);setHomeIssueQuery("");}} aria-label={t("关闭")}><X size={18} strokeWidth={1.8}/></button></div><label className="home-issue-search"><Search size={16}/><input value={homeIssueQuery} autoFocus placeholder={t("搜索名称、分类或 SKU")} onChange={event=>setHomeIssueQuery(event.target.value)}/></label><div className="home-issue-results">{items.filter(item=>`${item.name} ${item.category} ${item.sku}`.toLocaleLowerCase(localeForDates()).includes(homeIssueQuery.trim().toLocaleLowerCase(localeForDates()))).map(item=><button type="button" key={item.id} onClick={()=>chooseHomeIssueItem(item)}><span className="item-icon"><MaterialIcon value={itemIconFor(item)}/></span><span><strong>{item.name}</strong><small>{item.category?categoryLabel(item.category):t("未分类")} · {balanceFor(item.id)} {displayUnit(item.baseUnit)}</small></span><ChevronRight size={16}/></button>)}{items.filter(item=>`${item.name} ${item.category} ${item.sku}`.toLocaleLowerCase(localeForDates()).includes(homeIssueQuery.trim().toLocaleLowerCase(localeForDates()))).length===0&&<p className="empty compact">{t("没有匹配物资")}</p>}</div></section></div>}
      {workflowDialog === "transfer" && workflowItem && <TransferDialog item={workflowItem} locations={locations} onClose={()=>{setWorkflowDialog(null);setWorkflowItem(null);}} onSaved={()=>{setWorkflowDialog(null);setWorkflowItem(null);void load();}}/>}
      {stocktakeScope && <LocationStocktake key={`${stocktakeScope.kind}:${stocktakeScope.node.id}`} scope={stocktakeScope} onClose={()=>{window.history.replaceState(null,"",pagePaths[activePage]);setStocktakeScope(null);}} onSaved={()=>{window.history.replaceState(null,"",pagePaths[activePage]);setStocktakeScope(null);void load();}}/>}
      {workflowDialog === "history" && <OperationHistoryDialog onClose={()=>setWorkflowDialog(null)} onSaved={()=>void load()}/>}
      {stockAction && (
        <StockDialog setStockAction={setStockAction} recordStock={recordStock} stockAction={stockAction} stockLocationId={stockLocationId} setStockLocationId={setStockLocationId} stockTargetLocationId={stockTargetLocationId} setStockTargetLocationId={setStockTargetLocationId} locations={locations} locationOptions={locationOptions} shoppingChannels={shoppingChannels} expiryStatusFor={expiryStatusFor} busy={busy} />
      )}
      {showShoppingForm && (
        <ShoppingForm setShowShoppingForm={setShowShoppingForm} setShoppingItemId={setShoppingItemId} addShoppingItem={addShoppingItem} shoppingItemId={shoppingItemId} linkedShoppingItem={linkedShoppingItem} items={items} selectCategoryOptions={selectCategoryOptions} locationOptions={locationOptions} shoppingChannels={shoppingChannels} />
      )}
      {editShoppingItem && (
        <EditShoppingDialog setEditShoppingItem={setEditShoppingItem} setEditShoppingItemId={setEditShoppingItemId} updateShoppingItem={updateShoppingItem} editShoppingItemId={editShoppingItemId} linkedEditShoppingItem={linkedEditShoppingItem} editShoppingItem={editShoppingItem} items={items} selectCategoryOptions={selectCategoryOptions} locationOptions={locationOptions} shoppingChannels={shoppingChannels} />
      )}
      {receiveShoppingItem && (
        <ReceiveShoppingDialog setReceiveShoppingItem={setReceiveShoppingItem} receiveShopping={receiveShopping} receiveShoppingItem={receiveShoppingItem} receiveQuantity={receiveQuantity} setReceiveQuantity={setReceiveQuantity} items={items} locations={locations} locationOptions={locationOptions} receiveTotal={receiveTotal} setReceiveTotal={setReceiveTotal} receiveCompletion={receiveCompletion} setReceiveCompletion={setReceiveCompletion} receiveUnitPrice={receiveUnitPrice} financialSummary={financialSummary} busy={busy} />
      )}
      {showForm && (
        <ItemForm closeItemForm={closeItemForm} itemFormRevision={itemFormRevision} addItem={addItem} barcodeInput={barcodeInput} setBarcodeInput={setBarcodeInput} barcodeBusy={barcodeBusy} lookupItemBarcode={lookupItemBarcode} setShowBarcodeScanner={setShowBarcodeScanner} prefillName={prefillName} prefillCategory={prefillCategory} selectCategoryOptions={selectCategoryOptions} prefillUnit={prefillUnit} shoppingChannels={shoppingChannels} prefillLocationId={prefillLocationId} locationOptions={locationOptions} busy={busy} error={itemFormError} />
      )}
      {showBarcodeScanner && (
        <BarcodeScanner
          onClose={() => setShowBarcodeScanner(false)}
          onScan={(barcode) => {
            setShowBarcodeScanner(false);
            setBarcodeInput(barcode);
            void lookupItemBarcode(barcode);
          }}
        />
      )}
    </div>
  );
}
