'use strict';

class BaseDeviceController {
    constructor(device) {
        this.device = device;
        this.gattServer = null;
        this.isConnected = false;
        this.characteristics = {};
    }

    async connect() {
        if (this.isConnected) {
            console.log('Device is already connected.');
            return;
        }

        try {
            console.log(`Connecting to device: ${this.device.name}`);
            this.gattServer = await this.device.gatt.connect();
            this.isConnected = true;
            console.log(`Connected to device: ${this.device.name}`);
        } catch (error) {
            console.error(`Error connecting to device: ${error}`);
            throw error;
        }
    }

    async disconnect() {
        if (!this.isConnected) {
            console.log('Device is not connected.');
            return;
        }

        try {
            await this.device.gatt.disconnect();
            this.isConnected = false;
            this.gattServer = null;
            this.characteristics = {};
            console.log(`Disconnected from device: ${this.device.name}`);
        } catch (error) {
            console.error(`Error disconnecting from device: ${error}`);
            throw error;
        }
    }

    async getService(serviceUUID) {
        if (!this.isConnected) {
            throw new Error('Device is not connected.');
        }

        try {
            return await this.gattServer.getPrimaryService(serviceUUID);
        } catch (error) {
            console.error(`Error getting service ${serviceUUID}: ${error}`);
            throw error;
        }
    }

    async getCharacteristic(service, characteristicUUID, characteristicKey) {
        try {
            const characteristic = await service.getCharacteristic(characteristicUUID);
            this.characteristics[characteristicKey] = characteristic;
            return characteristic;
        } catch (error) {
            console.error(`Error getting characteristic ${characteristicUUID}: ${error}`);
            throw error;
        }
    }

    async startNotifications(characteristicKey, callback = null) {
        if (!this.characteristics[characteristicKey]) {
            throw new Error(`Characteristic ${characteristicKey} is not available`);
        }

        try {
            await this.characteristics[characteristicKey].startNotifications();
            this.characteristics[characteristicKey].addEventListener('characteristicvaluechanged', (event) => {
                const value = event.target.value;
                this.handleNotification(characteristicKey, value);
                if (callback) callback(value);
            });
            console.log(`Started notifications for ${characteristicKey}`);
        } catch (error) {
            console.error(`Error starting ${characteristicKey} notifications:`, error);
            throw error;
        }
    }

    async stopNotifications(characteristicKey) {
        if (!this.characteristics[characteristicKey]) {
            throw new Error(`Characteristic ${characteristicKey} is not available`);
        }

        try {
            await this.characteristics[characteristicKey].stopNotifications();
        } catch (error) {
            console.error(`Error stopping ${characteristicKey} notifications:`, error);
            throw error;
        }
    }
    // 生データ出力
    handleNotification(characteristicKey, value) {
        // console.log(`Received notification from ${characteristicKey}:`, value);
    }
}

class DeviceManager {
    constructor() {
        // 接続済デバイス配列
        this.devices = new Map();
        this.positionControllers = new Map();
        // 座標データを使用する関数配列
        this.positionListeners = new Map();
        this.canvasManager = new CanvasManager(globalConfig);
        this.deviceDrawingManager = new DeviceDrawingManager(this.canvasManager);
        this.uiManager = new UIManager('device-list');
    }

    setupEventListeners() {
        document.getElementById('connectButton').addEventListener('click', this.handleConnect.bind(this));
        document.getElementById('disconnectButton').addEventListener('click', this.handleDisconnect.bind(this));
        document.getElementById('startDrawingButton').addEventListener('click', this.handleStartDrawing.bind(this));
        document.getElementById('stopDrawingButton').addEventListener('click', this.handleStopDrawing.bind(this));
        document.getElementById('clearButton').addEventListener('click', this.handleClearCanvas.bind(this));
        document.getElementById('uploadfile').addEventListener('change', this.handleImageUpload.bind(this));
        document.getElementById('removeImage').addEventListener('click', this.handleRemoveimage.bind(this));
        this.setupModeListeners();
        // this.canvasManager.initializeCanvases();
    }
    // toio接続
    async handleConnect() {
        try {
            const { controller, drawingController } = await this.scanAndConnect();
            console.log('Connected to toio cube:', controller);
        } catch (error) {
            console.error('Error connecting to device:', error);
        }
    }
    // toio切断
    async handleDisconnect() {
        try {
            await this.disconnectAll();
            console.log('All devices disconnected');
        } catch (error) {
            console.error('Error disconnecting devices:', error);
        }
    }
    // 描画処理
    handleStartDrawing() {
        console.log('開始ボタンがクリックされました');
        const drawingControllers = this.getAllDrawingControllers();
        console.log(drawingControllers);
        if (drawingControllers.length > 0) {
            drawingControllers.forEach(controller => {
                controller.startDrawing();
            });
        } else {
            console.error('接続されたデバイスが見つかりません');
        }
    }

    handleStopDrawing() {
        console.log('停止ボタンがクリックされました');
        const drawingControllers = this.getAllDrawingControllers();
        if (drawingControllers.length > 0) {
            drawingControllers.forEach(controller => {
                controller.stopDrawing();
            });
        } else {
            console.error('接続されたデバイスが見つかりません');
        }
    }

    handleClearCanvas() {
        console.log('クリアボタンがクリックされました');
        this.canvasManager.clearCanvas();
    }

    setupModeListeners() {
        const modeRadios = document.querySelectorAll('input[name="mode"]');
        modeRadios.forEach(radio => {
            radio.addEventListener('change', (event) => {
                const drawingController = this.getFirstDrawingController();
                if (drawingController) {
                    if (event.target.value === '1') {
                        drawingController.setMode('pen');
                        console.log('ペンに切り替わりました');
                    } else if (event.target.value === '2') {
                        drawingController.setMode('eraser');
                        console.log('消しゴムに切り替わりました');
                    }
                } else {
                    console.error('接続されたデバイスが見つかりません');
                }
            });
        });
    }

    handleImageUpload(event) {
        this.canvasManager.handleImageUpload(event);
    }

    handleRemoveimage() {
        this.canvasManager.removeImage();
    }

    async scanAndConnect() {
        try {
            console.log("Requesting Bluetooth Device...");
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: [ToioController.TOIO_SERVICE_UUID] }]
            });

            const drawingController = this.deviceDrawingManager.createDrawingController(device);

            const onPositionMissed = () => {
                drawingController.drawFinish();
            };

            const controller = new ToioController(device, onPositionMissed);
            await controller.connect();
            this.devices.set(device.id, controller);
            this.positionControllers.set(device.id, controller.positionController);

            this.uiManager.updateDeviceList(device, drawingController);

            await controller.startPositionNotifications((position) => {
                this.notifyPositionListeners(device.id, position);
            });

            // DrawingController用のリスナーを追加
            this.addPositionListener(device.id, (position) => {
                drawingController.handlePositionUpdated(position);
            });

            // UIManager用のリスナーを追加
            this.addPositionListener(device.id, (position) => {
                this.uiManager.updatePositionDisplay(position);
            });

            return { controller, drawingController };
        } catch (error) {
            console.error('Error scanning and connecting to device:', error);
            throw error;
        }
    }

    async disconnectAll() {
        for (const [id, controller] of this.devices) {
            if (controller instanceof ToioController) {
                await this.disconnectDevice(id);
            }
        }
    }

    async disconnectDevice(deviceId) {
        const controller = this.devices.get(deviceId);
        if (controller && controller instanceof ToioController) {
            // 位置通知を停止
            await controller.stopPositionNotifications();
            await controller.disconnect();
            // 内部の状態をクリーンアップ 
            this.devices.delete(deviceId);
            this.positionControllers.delete(deviceId);
            this.deviceDrawingManager.removeDrawingController(deviceId);
            // リスナーを削除
            this.positionListeners.delete(deviceId);
            // UI更新
            this.uiManager.removeFromDeviceList(deviceId);
        }
    }

    getDevice(deviceId) {
        const device = this.devices.get(deviceId);
        return device instanceof ToioController ? device : null;
    }

    getAllDevices() {
        return Array.from(this.devices.values()).filter(device => device instanceof ToioController);
    }

    getDrawingController(deviceId) {
        return this.deviceDrawingManager.getDrawingController(deviceId);
    }

    // 全ての接続されたデバイスの DrawingController インスタンスを取得
    getAllDrawingControllers() {
        return Array.from(this.devices.values())
            .map(device => this.deviceDrawingManager.getDrawingController(device.device.id))
            .filter(controller => controller !== undefined);
    }

    // 接続された最初のデバイスのDrawingControllerを取得するメソッド
    getFirstDrawingController() {
        const devices = this.getAllDevices();
        if (devices.length > 0) {
            return this.getDrawingController(devices[0].device.id);
        }
        return null;
    }

    // 位置リスナーを追加するメソッド
    addPositionListener(deviceId, listenerFunction) {
        if (!this.positionListeners.has(deviceId)) {
            this.positionListeners.set(deviceId, new Set());
        }
        this.positionListeners.get(deviceId).add(listenerFunction);
    }

    // 位置リスナーを削除するメソッド
    removePositionListener(deviceId, listenerFunction) {
        if (this.positionListeners.has(deviceId)) {
            this.positionListeners.get(deviceId).delete(listenerFunction);
        }
    }

    // 位置が更新されたときに全てのリスナーに通知するメソッド
    notifyPositionListeners(deviceId, position) {
        if (this.positionListeners.has(deviceId)) {
            this.positionListeners.get(deviceId).forEach(listener => listener(position));
        }
    }
}

class CanvasManager {
    constructor(config) {
        this.config = config;
        this.paperCanvases = {
            backgroundCanvas: null,
            imageCanvas: null,
            drawCanvas: null,
            pointerCanvas: null
        };
        this.paperCtxs = {};
        // 用紙の色（デフォルトは白）
        this.paperColor = '#ffffff';
        this.paperSize = 'A3';
        this.paperOrientation = '横';
        this.paperDPI = 360;
        this.paperZoom = 1;

        // 最小ウィンドウ幅
        this.minWindowWidth = 600;
        // 最小ウィンドウ高さ
        this.minWindowHeight = 400;
        this.setupResizeListener();

        this.imageUploadManager = new ImageUploadManager(this);
        this.setupControls();
        this.isSetupComplete = false;
    }

    setupControls() {
        const controls = document.getElementById('controls');

        // サイズ選択
        this.sizeSelector = this.createSelector('sizeSelector', ['A3', 'A4'], 'サイズ選択');

        // 向き
        this.orientationSelector = this.createSelector('orientationSelector', ['縦', '横'], '向き');

        // 解像度
        this.resolutionSelector = this.createSelector('resolutionSelector', [200, 240, 300, 360], '解像度', 'DPI');

        // ズーム
        this.zoomSelector = this.createSelector('zoomSelector', [50, 100, 150, 200], 'ズーム', '%');

        controls.appendChild(this.sizeSelector);
        controls.appendChild(this.orientationSelector);
        controls.appendChild(this.resolutionSelector);
        controls.appendChild(this.zoomSelector);

        // イベントリスナーを追加
        [this.sizeSelector, this.orientationSelector, this.resolutionSelector, this.zoomSelector].forEach(selector => {
            selector.addEventListener('change', () => this.handlePaperSettingsChange());
        });

        // 初期値をセレクタに反映
        this.updateSelectorsFromSettings();;

        // セットアップ完了後にキャンバスを初期化
        this.isSetupComplete = true;
        this.initializeCanvases();
    }

    createSelector(id, options, labelText, suffix = '') {
        const container = document.createElement('div');
        container.className = 'row';

        const h5 = document.createElement('h5');
        h5.textContent = labelText;
        container.appendChild(h5);

        const select = document.createElement('select');
        select.className = 'form-select';
        select.id = id;
        options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option;
            optionElement.textContent = option + suffix;
            select.appendChild(optionElement);
        });
        container.appendChild(select);

        return container;
    }

    // セレクタに反映
    updateSelectorsFromSettings() {
        this.sizeSelector.querySelector('select').value = this.paperSize;
        this.orientationSelector.querySelector('select').value = this.paperOrientation;
        this.resolutionSelector.querySelector('select').value = this.paperDPI;
        this.zoomSelector.querySelector('select').value = this.paperZoom * 100;
    }

    //セレクタから取得
    updatePaperSettingsFromSelectors() {
        this.paperSize = this.sizeSelector.querySelector('select').value;
        this.paperOrientation = this.orientationSelector.querySelector('select').value;
        this.paperDPI = parseInt(this.resolutionSelector.querySelector('select').value);
        this.paperZoom = parseInt(this.zoomSelector.querySelector('select').value) / 100;

        // デバッグ
        // console.log('Paper settings updated:', {
        //     size: this.paperSize,
        //     orientation: this.paperOrientation,
        //     dpi: this.paperDPI,
        //     zoom: this.paperZoom
        // });
    }

    handlePaperSettingsChange() {
        // 現在の描画内容を保存
        const { tempCanvas, tempImageCanvas } = this.saveCurrentCanvasState();

        // 新しい設定を適用
        this.updatePaperSettingsFromSelectors();
        this.setCanvasSizes();

        // 一時保存した描画内容で新しいサイズで再描画
        this.redrawCanvas(tempCanvas, tempImageCanvas);
    }

    initializeCanvases() {
        if (this.isSetupComplete) {
            this.setupCanvases();
            this.setCanvasSizes();
            this.drawPaperBackground();
        }
    }

    setupResizeListener() {
        window.addEventListener('resize', this.handleResize.bind(this));
    }

    handleResize() {
        if (this.isWindowSizeBelowMinimum()) {
            console.log('Window size is below the minimum threshold. Ignoring resize.');
            return;
        }

        // 現在の描画内容を保存
        const { tempCanvas, tempImageCanvas } = this.saveCurrentCanvasState();

        // 新しいサイズを設定
        this.setCanvasSizes();

        // 保存した描画内容を新しいサイズで再描画
        this.redrawCanvas(tempCanvas, tempImageCanvas);
    }

    isWindowSizeBelowMinimum() {
        return window.innerWidth < this.minWindowWidth || window.innerHeight < this.minWindowHeight;
    }

    setupCanvases() {
        const canvasContainer = document.getElementById('canvas-container');

        // 用紙キャンバスのセットアップ
        Object.keys(this.paperCanvases).forEach((key, index) => {
            this.paperCanvases[key] = this.createCanvas(key, canvasContainer);
            this.paperCtxs[key] = this.paperCanvases[key].getContext('2d');
            this.paperCanvases[key].style.zIndex = (index + 1).toString();
        });

        this.drawCtx = this.paperCtxs.drawCanvas;
        this.imageCtx = this.paperCtxs.imageCanvas;
        this.pointerCtx = this.paperCtxs.pointerCanvas;

        this.clearOtherCanvases();
    }

    createCanvas(id, container) {
        const canvas = document.createElement('canvas');
        canvas.id = id;
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        container.appendChild(canvas);
        return canvas;
    }

    setCanvasSizes() {
        const canvasContainer = document.getElementById('canvas-container');

        // canvas-containerのサイズを取得
        const containerWidth = canvasContainer.clientWidth;
        const containerHeight = canvasContainer.clientHeight;

        // 用紙キャンバスのサイズを計算
        const paperDimensions = this.calculatePaperDimensions();

        // コンテナと用紙キャンバスのサイズ比を計算
        const scaleX = containerWidth / paperDimensions.width;
        const scaleY = containerHeight / paperDimensions.height;
        const scale = Math.min(scaleX, scaleY);

        // スケールに基づいて新しい用紙キャンバスのサイズを計算
        const newWidth = paperDimensions.width * scale;
        const newHeight = paperDimensions.height * scale;

        // 中央配置のためのマージンを計算
        const marginLeft = (containerWidth - newWidth) / 2;
        const marginTop = (containerHeight - newHeight) / 2;

        Object.values(this.paperCanvases).forEach((canvas, index) => {
            canvas.width = paperDimensions.width;
            canvas.height = paperDimensions.height;

            // 用紙キャンバスを中央に配置
            canvas.style.position = 'absolute';
            canvas.style.width = `${newWidth}px`;
            canvas.style.height = `${newHeight}px`;
            canvas.style.left = `${marginLeft}px`;
            canvas.style.top = `${marginTop}px`;
            canvas.style.margin = '0';
            canvas.style.zIndex = (index + 1).toString();
        });
        this.updateCanvasScales(newWidth, newHeight);

        // デバッグ
        // console.log(`Container size: ${containerWidth}x${containerHeight}`);
        // console.log(`Paper canvas size: ${newWidth}x${newHeight}`);
        // console.log(`Margins: left=${marginLeft}, top=${marginTop}`);
    }

    calculatePaperDimensions() {
        const dpi = this.paperDPI;
        let width, height;

        if (this.paperSize === 'A4') {
            width = 8.27 * dpi; // A4の幅（インチ）* DPI
            height = 11.69 * dpi; // A4の高さ（インチ）* DPI
        } else if (this.paperSize === 'A3') {
            width = 11.69 * dpi; // A3の幅（インチ）* DPI
            height = 16.54 * dpi; // A3の高さ（インチ）* DPI
        } else {
            console.error('Invalid paper size:', this.paperSize);
            return { width: 0, height: 0 };
        }

        if (this.paperOrientation === '横') {
            [width, height] = [height, width];
        }

        width *= this.paperZoom;
        height *= this.paperZoom;

        // デバッグ
        // console.log('Paper dimensions:', {
        //     width, height, dpi, zoom: this.paperZoom, size: this.paperSize, orientation: this.paperOrientation
        // });

        return { width, height };
    }

    drawPaperBackground() {
        // backgroundCanvasのコンテキストを取得
        const ctx = this.paperCtxs.backgroundCanvas;
        // 背景色を設定
        ctx.fillStyle = this.paperColor;
        // 背景を描画
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }

    clearOtherCanvases() {
        ['imageCanvas', 'drawCanvas', 'pointerCanvas'].forEach(canvasName => {
            const ctx = this.paperCtxs[canvasName];
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        });
    }

    updateCanvasScales(width, height) {
        this.config.scaleX = width / this.config.toioMatWidth;
        this.config.scaleY = height / this.config.toioMatHeight;
    }

    // 現在の描画内容を一時的に保存
    saveCurrentCanvasState() {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = this.paperCanvases.drawCanvas.width;
        tempCanvas.height = this.paperCanvases.drawCanvas.height;
        tempCtx.drawImage(this.paperCanvases.drawCanvas, 0, 0);

        const tempImageCanvas = document.createElement('canvas');
        const tempImageCtx = tempImageCanvas.getContext('2d');
        tempImageCanvas.width = this.paperCanvases.imageCanvas.width;
        tempImageCanvas.height = this.paperCanvases.imageCanvas.height;
        tempImageCtx.drawImage(this.paperCanvases.imageCanvas, 0, 0);

        return { tempCanvas, tempImageCanvas };
    }

    redrawCanvas(tempCanvas, tempImageCanvas) {
        if (!this.drawCtx || !this.imageCtx || !this.pointerCtx) {
            console.error('Canvas contexts are not properly initialized');
            return;
        }

        const drawCanvas = this.paperCanvases.drawCanvas;
        const imageCanvas = this.paperCanvases.imageCanvas;
        const pointerCanvas = this.paperCanvases.pointerCanvas;

        if (!drawCanvas || !imageCanvas || !pointerCanvas) {
            console.error('Paper canvases are not properly initialized');
            return;
        }
        
        // 新しいサイズに合わせてスケーリング
        const scaleX = drawCanvas.width / tempCanvas.width;
        const scaleY = drawCanvas.height / tempCanvas.height;

        // 背景の再描画
        this.drawPaperBackground();

        // 描画キャンバスをクリアして再描画
        this.drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        this.drawCtx.save();
        this.drawCtx.scale(scaleX, scaleY);
        this.drawCtx.drawImage(tempCanvas, 0, 0);
        this.drawCtx.restore();

        // イメージキャンバスをクリアして再描画
        this.imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
        this.imageCtx.save();
        this.imageCtx.scale(scaleX, scaleY);
        this.imageCtx.drawImage(tempImageCanvas, 0, 0);
        this.imageCtx.restore();

        // 背景の再描画
        this.drawPaperBackground();

        // ポインターキャンバスをクリア（ポインターは再描画せず、次の移動で更新される）
        this.pointerCtx.clearRect(0, 0, pointerCanvas.width, pointerCanvas.height);
    }



    getPixelInfo(x, y) {
        const imagePixelData = this.paperCtxs.imageCanvas.getImageData(x, y, 1, 1).data;
        const drawPixelData = this.paperCtxs.drawCanvas.getImageData(x, y, 1, 1).data;
        return { imagePixelData, drawPixelData, x, y };
    }

    clearCanvas(clearImage = false) {
        const drawCanvas = this.paperCanvases.drawCanvas;
        if (this.drawCtx) {
            this.drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
        }
    }

    resetCanvasSize() {
        this.setCanvasSizes();
        this.drawPaperBackground();
    }

    drawImage(img) {
        const imageCanvas = this.paperCanvases.imageCanvas;
        // 現在の用紙サイズを取得
        const canvasWidth = imageCanvas.width;
        const canvasHeight = imageCanvas.height;

        console.log(`Canvas dimensions: ${canvasWidth}x${canvasHeight}`);
        console.log(`Image dimensions: ${img.naturalWidth}x${img.naturalHeight}`);

        // 画像のアスペクト比を維持しながら、キャンバスに収まるようにサイズを調整
        const imgAspectRatio = img.naturalWidth / img.naturalHeight;
        const canvasAspectRatio = canvasWidth / canvasHeight;

        let drawWidth, drawHeight;
        if (imgAspectRatio > canvasAspectRatio) {
            drawWidth = canvasWidth;
            drawHeight = canvasWidth / imgAspectRatio;
        } else {
            drawHeight = canvasHeight;
            drawWidth = canvasHeight * imgAspectRatio;
        }

        // 画像を中央に配置
        const offsetX = (canvasWidth - drawWidth) / 2;
        const offsetY = (canvasHeight - drawHeight) / 2;

        // 画像を描画
        this.imageCtx.clearRect(0, 0, canvasWidth, canvasHeight);
        this.imageCtx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

        // キャンバススケールを更新（サイズは変更していないので、既存の値を使用）
        this.updateCanvasScales(parseFloat(imageCanvas.style.width), parseFloat(imageCanvas.style.height));

        imageCanvas.style.zIndex = '4';

        // 背景を再描画
        this.drawPaperBackground();

        // デバッグ
        // console.log(`Image drawn on canvas. Canvas size: ${canvasWidth}x${canvasHeight}, Image draw size: ${drawWidth}x${drawHeight}`);
        // console.log(`Canvas dimensions: ${canvasWidth}x${canvasHeight}`);
        // console.log(`Offset: ${offsetX}, ${offsetY}`);

        // const imageData = this.imageCtx.getImageData(0, 0, canvasWidth, canvasHeight);
        // console.log(`Image data size: ${imageData.data.length}`);
        // console.log(`First pixel color: rgba(${imageData.data[0]}, ${imageData.data[1]}, ${imageData.data[2]}, ${imageData.data[3]})`);
    }

    // 用紙色を設定するメソッド
    setPaperColor(color) {
        this.paperColor = color;
        Object.values(this.paperCtxs).forEach(ctx => {
            ctx.fillStyle = this.paperColor;
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        });
    }

    removeImage() {
        document.getElementById('uploadfile').value = '';
        const ctx = this.paperCtxs.imageCanvas;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        this.resetCanvasSize();
    }

    handleImageUpload(event) {
        this.imageUploadManager.handleImageUpload(event);
    }
}

class ImageUploadManager {
    constructor(canvasManager) {
        this.canvasManager = canvasManager;
    }

    handleImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.type.indexOf("image") < 0) {
            alert("画像ファイルを指定してください。");
            return false;
        }

        const reader = new FileReader();
        reader.onload = (e) => this.loadImage(e.target.result);
        reader.readAsDataURL(file);
    }

    loadImage(src) {
        const img = new Image();
        img.onload = () => this.canvasManager.drawImage(img);
        img.src = src;
    }
}

class DeviceDrawingManager {
    constructor(canvasManager) {
        this.drawingControllers = new Map();
        this.canvasManager = canvasManager;
    }

    createDrawingController(device) {
        const drawingController = new DrawingController(device, this.canvasManager);
        this.drawingControllers.set(device.id, drawingController);
        return drawingController;
    }

    getDrawingController(deviceId) {
        return this.drawingControllers.get(deviceId);
    }

    removeDrawingController(deviceId) {
        this.drawingControllers.delete(deviceId);
    }

    getAllDrawingControllers() {
        return Array.from(this.drawingControllers.values());
    }
}

class DrawingController {
    constructor(device, canvasManager) {
        this.device = device;
        this.canvasManager = canvasManager;

        this.isDrawingActive = false;
        this.isCurrentlyDrawing = false;
        this.isPositionValid = false;
        this.lastValidPosition = null;

        this.drawingState = {
            color: '#000000',
            alpha: 1,
            lineWidth: 10,
            mode: 'pen'
        };

        this.drawCtx = canvasManager.paperCtxs.drawCanvas;
        this.pointerCtx = canvasManager.paperCtxs.pointerCanvas;

        this.positionManager = new PositionManager(canvasManager.config);
        this.historyManager = new HistoryManager();
    }

    setMode(mode) {
        this.drawingState.mode = mode;
        this.updateUI();
        // this.updateStorageState();
    }

    setColor(value) {
        this.drawingState.color = value;
        this.updateUI();
        // this.updateStorageState();
    }

    setAlpha(value) {
        this.drawingState.alpha = value;
        this.updateUI();
        // this.updateStorageState();
    }

    setLineWidth(value) {
        this.drawingState.lineWidth = value;
        this.updateUI();
        // this.updateStorageState();
    }

    updateUI() {
        document.getElementById('size').textContent = this.drawingState.lineWidth;
        document.getElementById('size-slider').value = this.drawingState.lineWidth;
        document.getElementById('transparent').textContent = this.drawingState.alpha;
        document.getElementById('alpha-slider').value = this.drawingState.alpha;
        document.getElementById('pencilColor').value = this.drawingState.color;
    }

    applyDrawingStyle(ctx) {
        ctx.lineCap = 'round';
        ctx.lineWidth = this.drawingState.lineWidth;

        if (this.drawingState.mode === 'pen') {
            ctx.strokeStyle = this.drawingState.color;
            ctx.globalAlpha = this.drawingState.alpha;
        } else if (this.drawingState.mode === 'eraser') {
            ctx.strokeStyle = 'white';
            ctx.globalAlpha = 1;
        }
    }

    /*
    updateStorageState() {
        this.storageController.updateDrawingState(
            this.drawingState.color,
            this.drawingState.alpha,
            this.drawingState.lineWidth
        );
    }
    */

    startDrawing() {
        this.isDrawingActive = true;
        this.isCurrentlyDrawing = false;
        this.lastValidPosition = null;
    }

    stopDrawing() {
        this.isDrawingActive = false;
        this.drawFinish();
    }

    drawFinish() {
        this.positionManager.resetPosition();
        this.isCurrentlyDrawing = false;
        this.lastValidPosition = null;
        this.isPositionValid = false;
        // console.log('パス終了');
    }

    draw(position) {
        const { x: toX, y: toY } = this.positionManager.toioToCanvasCoords(position.sensorX, position.sensorY);
        const drawCanvas = this.canvasManager.paperCanvases.drawCanvas;

        // ポインターの位置をキャンバスのスケールに合わせて調整
        const scaleX = drawCanvas.width / parseFloat(drawCanvas.style.width);
        const scaleY = drawCanvas.height / parseFloat(drawCanvas.style.height);
        const adjustedX = toX * scaleX;
        const adjustedY = toY * scaleY;

        const pixelInfo = this.canvasManager.getPixelInfo(adjustedX, adjustedY);

        this.historyManager.addToPixelHistory(pixelInfo);

        if (!this.isCurrentlyDrawing) {
            this.drawCtx.beginPath();
            // console.log(`新しいパスを開始: ${toX}, ${toY}`);
            this.drawCtx.moveTo(adjustedX, adjustedY);
            this.isCurrentlyDrawing = true;
        } else {
            // console.log(`パスを継続: ${toX}, ${toY}`);
            this.drawCtx.lineTo(adjustedX, adjustedY);
            this.applyDrawingStyle(this.drawCtx);
            this.drawCtx.stroke();
        }

        this.positionManager.updatePosition(adjustedX, adjustedY);
    }

    drawPointer(position) {
        const { x: toX, y: toY } = this.positionManager.toioToCanvasCoords(position.sensorX, position.sensorY);
        const pointerCanvas = this.canvasManager.paperCanvases.pointerCanvas;
        this.pointerCtx.clearRect(0, 0, pointerCanvas.width, pointerCanvas.height);

        // デバッグ情報を描画
        // pointerCtx.font = '12px Arial';
        // pointerCtx.fillStyle = 'black';
        // pointerCtx.fillText(`Toio: (${position.sensorX}, ${position.sensorY})`, 10, 20);
        // pointerCtx.fillText(`Canvas: (${Math.round(toX)}, ${Math.round(toY)})`, 10, 40);

        if (this.drawingState.mode === 'eraser') {
            this.pointerCtx.strokeStyle = "rgba(255, 255, 255, 1)";
            this.pointerCtx.globalAlpha = 1;
        } else {
            this.pointerCtx.strokeStyle = this.drawingState.color;
            this.pointerCtx.globalAlpha = this.drawingState.alpha;
        }

        // ポインターの位置をキャンバスのスケールに合わせて調整
        const scaleX = pointerCanvas.width / parseFloat(pointerCanvas.style.width);
        const scaleY = pointerCanvas.height / parseFloat(pointerCanvas.style.height);
        const adjustedX = toX * scaleX;
        const adjustedY = toY * scaleY;

        // ポインターのサイズを線の太さに合わせて調整
        const pointerSize = this.drawingState.lineWidth * 1;

        this.pointerCtx.strokeStyle = this.drawingState.color;
        this.pointerCtx.fillStyle = this.drawingState.color;
        this.pointerCtx.globalAlpha = this.drawingState.alpha;
        this.pointerCtx.lineWidth = 2;

        this.pointerCtx.beginPath();
        this.pointerCtx.arc(adjustedX, adjustedY, pointerSize / 2, 0, 2 * Math.PI);
        this.pointerCtx.fill();
        this.pointerCtx.stroke();

        // 中心点を示す小さな点を追加
        this.pointerCtx.fillStyle = this.drawingState.mode === 'eraser' ? "rgba(0, 0, 0, 0.8)" : "rgba(255, 255, 255, 0.8)";
        this.pointerCtx.beginPath();
        this.pointerCtx.arc(adjustedX, adjustedY, 1, 0, 2 * Math.PI);
        this.pointerCtx.fill();
    }

    handlePositionUpdated(positionData) {
        // console.log('Position updated:', positionData);

        if (positionData.sensorX !== undefined && positionData.sensorY !== undefined) {
            this.drawPointer(positionData);  // ポインターを描画

            if (this.isDrawingActive) {
                if (!this.isPositionValid) {
                    // 前回の位置が無効だった場合、新しいパスを開始
                    this.isCurrentlyDrawing = false;
                }
                this.isPositionValid = true;
                this.lastValidPosition = positionData;
                this.draw(positionData);
            }
        } else {
            // console.log('座標を取得できません');
            this.isPositionValid = false;
            this.drawFinish();
            const pointerCanvas = this.canvasManager.paperCanvases.pointerCanvas;
            this.pointerCtx.clearRect(0, 0, pointerCanvas.width, pointerCanvas.height);  // ポインターをクリア
        }
    }
}

class PositionManager {
    constructor(config) {
        this.config = config;
        this.x = null;
        this.y = null;
    }

    toioToCanvasCoords(x, y) {
        const canvasX = (x + this.config.positionRegX) * this.config.scaleX;
        const canvasY = (y + this.config.positionRegY) * this.config.scaleY;
        return { x: canvasX, y: canvasY };
    }

    // toioToCanvasCoords(x, y) {
    //     const canvasX = (x - this.config.toioMinX) / (this.config.toioMaxX - this.config.toioMinX) * this.config.defaultCanvasWidth;
    //     const canvasY = (y - this.config.toioMinY) / (this.config.toioMaxY - this.config.toioMinY) * this.config.defaultCanvasHeight;
    //     return { x: canvasX, y: canvasY };
    // }

    resetPosition() {
        this.x = null;
        this.y = null;
    }

    updatePosition(x, y) {
        this.x = x;
        this.y = y;
    }
}

class HistoryManager {
    constructor() {
        this.imagePixelDataHistory = [];
        this.drawPixelDataHistory = [];
    }

    addToPixelHistory(pixelInfo) {
        this.imagePixelDataHistory.push(Array.from(pixelInfo.imagePixelData));
        this.drawPixelDataHistory.push(Array.from(pixelInfo.drawPixelData));
    }

    // Add methods for undo/redo functionality if needed
}

class UIManager {
    constructor(deviceListId) {
        this.deviceListElement = document.getElementById(deviceListId);
        this.DispSenserX = document.getElementById('dispX');
        this.DispSenserY = document.getElementById('dispY');
        this.DispSenserAngle = document.getElementById('dispAngle');
    }

    updateDeviceList(device, drawingController) {
        const deviceElement = document.createElement('div');
        deviceElement.className = 'device-item';
        deviceElement.dataset.deviceId = device.id;

        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = device.name;
        details.appendChild(summary);

        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'device-controls';

        // ペン/消しゴム切り替え
        const modeControl = this.createModeControl(device.id, drawingController);
        controlsContainer.appendChild(modeControl);

        // 線の太さ
        const sizeControl = this.createSizeControl(drawingController);
        controlsContainer.appendChild(sizeControl);

        // 透明度
        const alphaControl = this.createAlphaControl(drawingController);
        controlsContainer.appendChild(alphaControl);

        // 色選択
        const colorControl = this.createColorControl(drawingController);
        controlsContainer.appendChild(colorControl);

        details.appendChild(controlsContainer);
        deviceElement.appendChild(details);
        this.deviceListElement.appendChild(deviceElement);
    }

    createModeControl(deviceId, drawingController) {
        const container = document.createElement('div');
        container.className = 'mode-control';

        const penRadio = document.createElement('input');
        penRadio.type = 'radio';
        penRadio.name = `mode-${deviceId}`;
        penRadio.value = 'pen';
        penRadio.id = `pen-${deviceId}`;
        penRadio.checked = true;

        const penLabel = document.createElement('label');
        penLabel.htmlFor = penRadio.id;
        penLabel.textContent = 'ペン';

        const eraserRadio = document.createElement('input');
        eraserRadio.type = 'radio';
        eraserRadio.name = `mode-${deviceId}`;
        eraserRadio.value = 'eraser';
        eraserRadio.id = `eraser-${deviceId}`;

        const eraserLabel = document.createElement('label');
        eraserLabel.htmlFor = eraserRadio.id;
        eraserLabel.textContent = '消しゴム';

        container.appendChild(penRadio);
        container.appendChild(penLabel);
        container.appendChild(eraserRadio);
        container.appendChild(eraserLabel);

        [penRadio, eraserRadio].forEach(radio => {
            radio.addEventListener('change', (event) => {
                drawingController.setMode(event.target.value);
            });
        });

        return container;
    }

    createSizeControl(drawingController) {
        const container = document.createElement('div');
        container.className = 'size-control';

        const label = document.createElement('label');
        label.textContent = '太さ: ';
        
        const sizeDisplay = document.createElement('span');
        sizeDisplay.textContent = drawingController.drawingState.lineWidth;

        const sizeSlider = document.createElement('input');
        sizeSlider.type = 'range';
        sizeSlider.min = '1';
        sizeSlider.max = '50';
        sizeSlider.value = drawingController.drawingState.lineWidth;

        sizeSlider.addEventListener('input', (event) => {
            const newSize = event.target.value;
            drawingController.setLineWidth(newSize);
            sizeDisplay.textContent = newSize;
        });

        container.appendChild(label);
        container.appendChild(sizeDisplay);
        container.appendChild(sizeSlider);

        return container;
    }

    createAlphaControl(drawingController) {
        const container = document.createElement('div');
        container.className = 'alpha-control';

        const label = document.createElement('label');
        label.textContent = '透明度: ';
        
        const alphaDisplay = document.createElement('span');
        alphaDisplay.textContent = drawingController.drawingState.alpha;

        const alphaSlider = document.createElement('input');
        alphaSlider.type = 'range';
        alphaSlider.min = '0';
        alphaSlider.max = '1';
        alphaSlider.step = '0.1';
        alphaSlider.value = drawingController.drawingState.alpha;

        alphaSlider.addEventListener('input', (event) => {
            const newAlpha = event.target.value;
            drawingController.setAlpha(newAlpha);
            alphaDisplay.textContent = newAlpha;
        });

        container.appendChild(label);
        container.appendChild(alphaDisplay);
        container.appendChild(alphaSlider);

        return container;
    }

    createColorControl(drawingController) {
        const container = document.createElement('div');
        container.className = 'color-control';

        const label = document.createElement('label');
        label.textContent = '色: ';

        const colorPicker = document.createElement('input');
        colorPicker.type = 'color';
        colorPicker.value = drawingController.drawingState.color;

        colorPicker.addEventListener('input', (event) => {
            drawingController.setColor(event.target.value);
        });

        container.appendChild(label);
        container.appendChild(colorPicker);

        return container;
    }

    removeFromDeviceList(deviceId) {
        const deviceElement = this.deviceListElement.querySelector(`[data-device-id="${deviceId}"]`);
        if (deviceElement) {
            deviceElement.remove();
        }
    }

    clearDeviceList() {
        while (this.deviceListElement.firstChild) {
            this.deviceListElement.removeChild(this.deviceListElement.firstChild);
        }
    }

    updatePositionDisplay(position) {
        if (position && position.x !== undefined && position.y !== undefined && position.angle !== undefined) {
            this.DispSenserX.textContent = position.x;
            this.DispSenserY.textContent = position.y;
            this.DispSenserAngle.textContent = position.angle;
        } else {
            this.DispSenserX.textContent = 'N/A';
            this.DispSenserY.textContent = 'N/A';
            this.DispSenserAngle.textContent = 'N/A';
        }
    }

}

class ToioController extends BaseDeviceController {
    static TOIO_SERVICE_UUID = "10b20100-5b3b-4571-9508-cf3efcd7bbae";
    static MOTOR_CHARACTERISTIC_UUID = "10b20102-5b3b-4571-9508-cf3efcd7bbae";
    static ID_SENSOR_CHARACTERISTIC_UUID = "10b20101-5b3b-4571-9508-cf3efcd7bbae";
    static EULERIAN_ANGLES_CHARACTERISTIC_UUID = "10b20106-5b3b-4571-9508-cf3efcd7bbae";
    static CONFIGURATION_CHARACTERISTIC_UUID = "10b201ff-5b3b-4571-9508-cf3efcd7bbae";

    constructor(device, onPositionMissed) {
        super(device);
        this.toioService = null;
        this.positionController = new PositionController(device.id, onPositionMissed);
    }

    async connect() {
        await super.connect();
        await this.setupToioService();
    }

    async disconnect() {
        await super.disconnect();
        this.positionData = { x: 0, y: 0, angle: 0 };
    }

    async setupToioService() {
        try {
            this.toioService = await this.getService(ToioController.TOIO_SERVICE_UUID);
            this.characteristics.motor = await this.getCharacteristic(this.toioService, ToioController.MOTOR_CHARACTERISTIC_UUID);
            this.characteristics.sensor = await this.getCharacteristic(this.toioService, ToioController.ID_SENSOR_CHARACTERISTIC_UUID);
            this.characteristics.eulerianAngles = await this.getCharacteristic(this.toioService, ToioController.EULERIAN_ANGLES_CHARACTERISTIC_UUID);
            this.characteristics.config = await this.getCharacteristic(this.toioService, ToioController.CONFIGURATION_CHARACTERISTIC_UUID);
        } catch (error) {
            console.error('Error setting up toio service:', error);
            throw error;
        }
    }

    async startPositionNotifications(callback = null) {
        await this.startNotifications('sensor', (event) => {
            this.positionController.handleSensorNotification(event);
            if (callback) callback(this.positionController.getPosition());
        });
    }

    async stopPositionNotifications() {
        await this.stopNotifications('sensor');
    }
}

class PositionController {
    constructor(deviceId, onPositionMissed) {
        this.deviceId = deviceId;
        this.positionData = { x: 0, y: 0, angle: 0, sensorX: 0, sensorY: 0, sensorAngle: 0 };
        this.onPositionMissed = onPositionMissed;
    }

    updatePosition(newData) {
        this.positionData = { ...this.positionData, ...newData };
    }

    getPosition() {
        return this.positionData;
    }

    handleSensorNotification(event) {
        const value = event;

        // valueの型をチェックして処理
        if (value instanceof DataView) {
            // すでにDataViewの場合はそのまま使用
            this.processDataView(value);
        } else if (value instanceof ArrayBuffer) {
            // ArrayBufferの場合はDataViewに変換
            const dataView = new DataView(value);
            this.processDataView(dataView);
        } else {
            // その他の型の場合はエラーログを出力
            console.error('Unexpected value type:', value);
            return;
        }
    }
    // 通知内容判別
    processDataView(dataView) {
        const notificationType = dataView.getUint8(0);

        if (notificationType === 0x01) {
            this.handlePositionChange(dataView);
        } else if (notificationType === 0x03) {
            this.handlePositionMissed(dataView);
        }
    }

    handlePositionChange(value) {
        const dataView = new DataView(value.buffer);
        if (dataView.getUint8(0) === 0x01) { // Position ID information
            this.positionData = {
                x: dataView.getUint16(1, true),
                y: dataView.getUint16(3, true),
                angle: dataView.getUint16(5, true),
                sensorX: dataView.getUint16(7, true),
                sensorY: dataView.getUint16(9, true),
                sensorAngle: dataView.getUint16(11, true)
            };
        } else {
            this.handlePositionMissed();
        }
    }

    handlePositionMissed() {
        console.log('座標を取得できません');
        this.positionData = {
            x: undefined, y: undefined, angle: undefined,
            sensorX: undefined, sensorY: undefined, sensorAngle: undefined
        };
        if (this.onPositionMissed) {
            this.onPositionMissed();
        }
    }
}


/*
==============================
設定
==============================
*/
// Canvasと座標関連の設定をグローバルに定義
const globalConfig = {
    toioMinX: 98,   // toioマットの左端のX座標
    toioMaxX: 402,  // toioマットの右端のX座標
    toioMinY: 142,   // toioマットの上端のY座標
    toioMaxY: 358,  // toioマットの下端のY座標
    toioMatWidth: 304,
    toioMatHeight: 216,
    positionRegX: -90,
    positionRegY: -140,
    // 動的に計算されるキャンバスサイズ
    get defaultCanvasWidth() {
        return 320 * 4.5;
    },
    get defaultCanvasHeight() {
        return this.defaultCanvasWidth * (this.toioMatHeight / this.toioMatWidth);
    }
};

/*
==============================
イベントリスナー
==============================
*/
document.addEventListener('DOMContentLoaded', () => {
    // インスタンス
    const deviceManager = new DeviceManager();

    deviceManager.setupEventListeners();
})