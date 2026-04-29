// Public API entrypoint for all client services.
// Re-export concrete module APIs so consumers can import from '@/services/api'.
export { authApi } from './api/auth';
export { commodityApi } from './api/commodities';
export { contactApi } from './api/contacts';
export { arrivalsApi } from './api/arrivals';
export { traderApi } from './api/trader';
export { vehicleApi } from './api/vehicles';
export { categoryApi } from './api/categories';
export { rbacApi, traderRbacApi } from './api/rbac';
export { auctionApi, fetchAllAuctionResults } from './api/auction';
export { weighingApi } from './api/weighing';
export { printLogApi } from './api/printLog';
export { logisticsApi } from './api/logistics';
export { selfSaleApi } from './api/selfSale';
export { stockPurchaseApi } from './api/stockPurchase';
export { cdnApi } from './api/cdn';
export { settlementApi } from './api/settlement';
export { billingApi } from './api/billing';
export { chartOfAccountsApi } from './api/chartOfAccounts';
export { writersPadApi } from './api/writersPad';
export { presetMarksApi } from './api/presetMarks';
export type { PresetMarkSettingDTO } from './api/presetMarks';
export { printSettingsApi } from './api/printSettings';
export type {
  PrintSettingDTO,
  PrintModuleKey,
  PrintPaperSize,
  PrintCopyItem,
} from './api/printSettings';
export {
  parsePrintCopiesJson,
  serializePrintCopiesJson,
  DEFAULT_PRINT_COPIES,
} from './api/printSettings';
export type {
  SellerSettlementDTO,
  SettlementLotDTO,
  SettlementEntryDTO,
  PattiDTO,
  PattiSaveRequest,
  RateClusterDTO,
  DeductionItemDTO,
  ListSellersParams,
  ListPattisParams,
} from './api/settlement';
export type {
  CDNResponseDTO,
  CDNLineItemDTO,
  CDNCreateRequest,
  ReceiveByPINRequest,
  CDNListResult,
} from './api/cdn';
export type {
  LotSummaryDTO,
  AuctionSessionDTO,
  AuctionEntryDTO,
  AuctionResultDTO,
  AuctionResultEntryDTO,
  AuctionBidCreateRequest,
  AuctionBidUpdateRequest,
  ListLotsParams,
  ListResultsParams,
  PresetType,
} from './api/auction';
export type { WeighingSessionDTO, WeighingSessionCreateRequest } from './api/weighing';
export type { PrintLogDTO, PrintLogCreateRequest } from './api/printLog';
export type { OpenLotDTO, ClosureDTO, CreateClosureRequest } from './api/selfSale';
export type { StockPurchaseDTO, StockPurchasePage, CreateStockPurchaseRequest } from './api/stockPurchase';
export type { SalesBillDTO, SalesBillPage, SalesBillCreateOrUpdateRequest } from './api/billing';
export type {
  ChartOfAccountDTO,
  ChartOfAccountPage,
  ChartOfAccountCreateRequest,
  ChartOfAccountUpdateRequest,
} from './api/chartOfAccounts';
export { voucherHeadersApi } from './api/voucherHeaders';
export type {
  VoucherHeaderDTO,
  VoucherLineDTO,
  VoucherHeaderPage,
  VoucherHeaderCreateRequest,
} from './api/voucherHeaders';
export type {
  WriterPadSessionDTO,
  WriterPadWeightEntryDTO,
  WriterPadSessionWithLogDTO,
} from './api/writersPad';
