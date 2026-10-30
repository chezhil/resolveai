// Paytm Payment Gateway integration boundary.
// The agent's `paytm_order_status` tool talks to this interface. The bundled implementation is a
// mock that answers from the simulated world with the response shape of Paytm PG's Transaction
// Status API (POST /v3/order/status: head + body.resultInfo). Swapping in the sandbox client is
// a matter of implementing `PaytmPg` against securegw-stage.paytm.in with the merchant's MID/key.

import type { World, Txn } from "../sim/world.js";

export interface PaytmOrderStatus {
  head: { responseTimestamp: string; version: string; signature: string };
  body: {
    resultInfo: { resultStatus: "TXN_SUCCESS" | "PENDING" | "TXN_FAILURE"; resultCode: string; resultMsg: string };
    txnId: string;
    bankTxnId: string;
    orderId: string;
    txnAmount: string;
    txnType: "SALE";
    gatewayName: "UPI";
    paymentMode: "UPI";
    mid: string;
    txnDate: string;
  };
}

export interface PaytmPg {
  readonly mode: "mock" | "staging";
  orderStatus(orderId: string): Promise<PaytmOrderStatus>;
}

export const orderIdFor = (t: Pick<Txn, "txnId">) => `ORD-${t.txnId}`;

export class MockPaytmPg implements PaytmPg {
  readonly mode = "mock" as const;
  constructor(private world: World) {}

  async orderStatus(orderId: string): Promise<PaytmOrderStatus> {
    const t = [...this.world.txns.values()].find((x) => orderIdFor(x) === orderId || x.txnId === orderId);
    if (!t) throw new Error(`Paytm PG: order ${orderId} not found (resultCode 334)`);
    const m = this.world.merchants.get(t.merchantId)!;
    const result =
      t.beneficiaryCredit === "SUCCESS"
        ? { resultStatus: "TXN_SUCCESS" as const, resultCode: "01", resultMsg: "Txn Success" }
        : t.beneficiaryCredit === "PENDING"
          ? { resultStatus: "PENDING" as const, resultCode: "402", resultMsg: "Looks like the payment is not complete. Please wait while we confirm the status with your bank." }
          : { resultStatus: "TXN_FAILURE" as const, resultCode: "227", resultMsg: "Your payment has been declined by your bank; amount reversed." };
    return {
      head: { responseTimestamp: String(this.world.now()), version: "v1", signature: "mock-signature" },
      body: {
        resultInfo: result,
        txnId: t.txnId,
        bankTxnId: t.rrn,
        orderId: orderIdFor(t),
        txnAmount: t.amount.toFixed(2),
        txnType: "SALE",
        gatewayName: "UPI",
        paymentMode: "UPI",
        mid: `PAYTM${m.id}`,
        txnDate: new Date(t.ts).toISOString().replace("T", " ").slice(0, 19),
      },
    };
  }
}
