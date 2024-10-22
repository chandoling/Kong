const Web3 = require('web3');
const fs = require('fs');

// RPC URL 설정 (Scroll Sepolia Testnet)
const web3 = new Web3('https://rpc.scroll.io');

// 대상 주소 설정
const destinationAddress = '안전한 지갑 주소';

// privatekey_sepolia_test.txt 파일에서 개인 키 읽기
const privateKeys = fs.readFileSync('privatekey_sepolia_test.txt', 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

// L1GasPriceOracle의 ABI와 주소
const L1GasPriceOracleABI = [
    {
        "constant": true,
        "inputs": [
            {
                "name": "_data",
                "type": "bytes"
            }
        ],
        "name": "getL1Fee",
        "outputs": [
            {
                "name": "",
                "type": "uint256"
            }
        ],
        "payable": false,
        "stateMutability": "view",
        "type": "function"
    }
];
const L1GasPriceOracleAddress = '0x5300000000000000000000000000000000000002';
const L1GasPriceOracle = new web3.eth.Contract(L1GasPriceOracleABI, L1GasPriceOracleAddress);

// 상수 설정
const ETH_GAS_GWEI = web3.utils.toWei('1', 'gwei'); // 가스 가격 설정
const ETH_MIN_SWEEP = '0'; // 스윕을 시작할 최소 ETH 잔액
const GAS_LIMIT = 21000; // 가스 한도
const CHAIN_ID = 534352; // 체인 ID 설정 

// 지연 함수
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// L1 수수료를 가져오는 함수
async function getL1Fee(txData) {
    try {
        const l1Fee = await L1GasPriceOracle.methods.getL1Fee(txData).call();
        return BigInt(l1Fee);
    } catch (error) {
        console.error(`L1 수수료를 가져오는 중 오류 발생: ${error}`);
        return BigInt(0);
    }
}

// 잔액 확인 및 ETH 스윕 함수
async function checkAndSweep(privateKey) {
    let walletAddress; // walletAddress를 함수 상위 스코프에서 선언
    try {
        const account = web3.eth.accounts.privateKeyToAccount(privateKey);
        walletAddress = account.address;

        // 지갑의 ETH 잔액 가져오기
        const balanceWei = await web3.eth.getBalance(walletAddress);

        // 잔액이 최소 스윕 금액보다 큰지 확인
        if (BigInt(balanceWei) > web3.utils.toWei(ETH_MIN_SWEEP, 'ether')) {
            console.log(`${walletAddress}에서 ${web3.utils.fromWei(balanceWei, 'ether')} ETH 감지됨. 전송 중...`);

            // 지갑의 nonce 값 가져오기
            const nonce = await web3.eth.getTransactionCount(walletAddress, 'pending');

            // 가스 비용 계산
            const gasPriceWei = BigInt(web3.utils.toWei('1', 'gwei'));
            const gasCost = gasPriceWei * BigInt(GAS_LIMIT);

            // L1 수수료 계산을 위한 트랜잭션 데이터 준비
            const txData = '0x'; // ETH 전송은 데이터 필드가 없음

            const l1Fee = await getL1Fee(txData);

            // 총 비용 (가스 비용 + L1 수수료, L1 수수료에 20% 여유 추가)
            const totalCost = gasCost + (l1Fee * 11n / 10n);

            // 전송할 금액 계산 (잔액 - 총 비용)
            const amountToSend = BigInt(balanceWei) - totalCost;

            if (amountToSend > 0n) {
                const tx = {
                    chainId: CHAIN_ID,
                    nonce: nonce,
                    to: destinationAddress,
                    value: '0x' + amountToSend.toString(16),
                    gas: '0x' + GAS_LIMIT.toString(16),
                    gasPrice: '0x' + gasPriceWei.toString(16),
                };

                // 트랜잭션 서명
                const signedTx = await web3.eth.accounts.signTransaction(tx, privateKey);

                // 서명된 트랜잭션 전송 (비동기로 처리하여 다음 지갑으로 바로 이동)
                web3.eth.sendSignedTransaction(signedTx.rawTransaction)
                    .then(receipt => {
                        console.log(`전송 완료. Tx Hash: ${receipt.transactionHash}`);
                    })
                    .catch(err => {
                        console.error(`트랜잭션 전송 중 오류 발생: ${err}`);
                    });

            } else {
                console.log(`${walletAddress}의 잔액이 수수료보다 적어 전송 불가.`);
            }
        } else {
            console.log(`${walletAddress}에 ETH 잔액이 없습니다. 다음 지갑으로...`);
        }
    } catch (err) {
        console.error(`${walletAddress || '알 수 없는 주소'} 지갑 처리 중 오류 발생: ${err}`);
    }
}

// 모든 지갑을 빠르게 훑는 메인 함수
async function sweepAllWallets() {
    while (true) {  // 무한 루프
        for (let i = 0; i < privateKeys.length; i++) {
            const privateKey = privateKeys[i];
            try {
                // 비동기로 checkAndSweep 호출
                await checkAndSweep(privateKey);
            } catch (error) {
                console.error(`지갑 처리 중 오류 발생: ${error.message}`);
            }
            // 각 지갑 처리 사이에 200ms 지연 추가
            await sleep(1);
        }
        console.log('모든 지갑 훑기 완료. 1초 후 다시 시작');
        // 다시 실행하기 전에 1초 대기
        await sleep(1000);
    }
}

// 스위퍼 봇 실행
sweepAllWallets();
